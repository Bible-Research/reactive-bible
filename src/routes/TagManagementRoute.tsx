import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { openConfirmModal } from '@mantine/modals';
import { Tag } from '../types';
import {
  deleteTag as deleteTagApi,
  getNotes,
  reparentTag,
  setTagPublic,
} from '../api';
import { TagTree } from '../components/TagTree';
import { CreateTagModal } from '../components/CreateTagModal';
import { EditTagModal } from '../components/EditTagModal';
import { useBibleStore } from '../store';
import { clearNotesCache } from '../utils/cacheManager';
import { buildTagTree, TagNode } from '../utils/tagTree';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';
import { textOrKey } from '../i18n/errorText';

/**
 * Sums each node's own `note_count` with all of its
 * descendants' — the `+k` subtree badge in TagTree. Post-order
 * over `buildTagTree` output; missing counts treat as 0.
 */
const computeSubtreeCounts = (
  nodes: TagNode[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  const walk = (node: TagNode): number => {
    let total = node.tag.note_count ?? 0;
    for (const child of node.children) {
      total += walk(child);
    }
    counts[node.tag.id] = total;
    return total;
  };
  nodes.forEach(walk);
  return counts;
};

export default function TagManagementRoute() {
const { t } = useTranslation();
  const navigate = useNavigate();
  const { tags, getTags } = useBibleStore(
    (state) => ({
      tags: state.tags,
      getTags: state.getTags,
    }),
    shallow
  );
  const removeTagPagination = useBibleStore(
    (state) => state.removeTagPagination
  );
  // At `sm` and narrower (768px is Mantine's `sm` — the
  // query includes it) the page chrome compresses: smaller
  // title, icon-only New Tag button, full-width search
  // with the tag count riding on the same row. `undefined`
  // initialValue lets matchMedia resolve during the first
  // render — a boolean would flash the desktop layout for
  // one frame.
  const compact = useMediaQuery('(max-width: 768px)', undefined, {
    getInitialValueInEffect: false,
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  // Total note count shown next to the tag count — `null`
  // until fetched (and stays null if the fetch fails, in
  // which case the summary just omits it).
  const [noteTotal, setNoteTotal] = useState<number | null>(
    null
  );
  // Set while a reparent PATCH is in flight — further drops
  // are ignored and the refreshing Loader shows.
  const reparentingRef = useRef(false);

  // Handlers below are useCallback'd so memoized children
  // (TagTree, the tag modals) don't re-render on unrelated
  // state changes like search typing.
  const loadTags = useCallback(
    async (
      forceRefresh = false,
      { silent = false }: { silent?: boolean } = {}
    ) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      try {
        await getTags(forceRefresh);
        setInitialError(false);
      } catch (error) {
        console.error('Error loading tags:', error);
        // A failed first load must not fall through to the
        // "No tags yet" empty state — offer a retry instead.
        if (!silent) {
          setInitialError(true);
        }
        showNotification({
          title: t('common.error'),
          message: t('tags.loadFailed'),
          color: 'red',
        });
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setInitialLoading(false);
        }
      }
    },
    [getTags, t]
  );

  useEffect(() => {
    void loadTags(true); // Force refresh on mount
  }, [loadTags]);

  // `count` on a one-item page is the user's total note
  // count — the cheap way to render "N tags · M notes"
  // without fetching any note bodies. A failure only omits
  // the count; the page and the tags summary stay intact.
  useEffect(() => {
    let cancelled = false;
    const loadNoteTotal = async () => {
      try {
        const page = await getNotes(undefined, { pageSize: 1 });
        if (!cancelled) {
          setNoteTotal(page.count);
        }
      } catch (error) {
        console.error('Error loading notes count:', error);
      }
    };
    void loadNoteTotal();
    return () => {
      cancelled = true;
    };
  }, []);

  const deleteTag = useCallback(
    async (tagId: string) => {
      try {
        await deleteTagApi(tagId);
        showNotification({
          title: t('common.success'),
          message: t('tags.deleted'),
          color: 'green',
        });
        // The deleted tag's own cached pages still answer
        // `/notes/tag/<id>` before getTag can 404, and
        // every ancestor's merged `sub:true` page keeps
        // listing its notes under a ghost section. The
        // notes cache never expires — drop it whole
        // (same as deleteNote).
        clearNotesCache();
        // The deleted tag's remembered page/pageSize is dead
        // weight — tag ids are never reused.
        removeTagPagination(tagId);
        await loadTags(true, { silent: true }); // Force refresh
      } catch (error) {
        console.error('Error deleting tag:', error);
        showNotification({
          title: t('common.error'),
          message:
            t('tags.deleteFailed'),
          color: 'red',
        });
      }
    },
    [loadTags, removeTagPagination, t]
  );

  const handleDeleteTag = useCallback(
    (tagId: string, tagName: string) => {
      const childCount = tags.filter(
        (tag) => tag.parent_tag === tagId
      ).length;
      openConfirmModal({
        title: t('tags.deleteTitle'),
        children: (
          <Text size="sm">
            {t('tags.deleteConfirm', {
                name: tagName,
                body: t('tags.deleteBody'),
                suffix:
                  childCount > 0
                    ? t('tags.deleteChildSuffix', {
                        count: childCount,
                      })
                    : '',
              })}
          </Text>
        ),
        labels: {
          confirm: t('common.delete'),
          cancel: t('common.cancel'),
        },
        confirmProps: { color: 'red' },
        onConfirm: () => void deleteTag(tagId),
      });
    },
    [deleteTag, tags, t]
  );

  const handleEditTag = useCallback((tag: Tag) => {
    setEditingTag(tag);
  }, []);

  const handleCreateTag = useCallback(() => {
    setCreateModalOpen(true);
  }, []);

  const handleViewNotes = useCallback(
    (tagId: string) => {
      void navigate(`/notes/tag/${tagId}`);
    },
    [navigate]
  );

  const toggleTagPublic = useCallback(
    async (tag: Tag, makingPublic: boolean) => {
      try {
        const result = await setTagPublic(tag.id, makingPublic);
        showNotification({
          title: t('common.success'),
          message:
            t('tags.publicityResult', {
              state: makingPublic
                ? t('tags.statePublic')
                : t('tags.statePrivate'),
              count: result.notes_updated,
            }),
          color: 'green',
        });
        // The tag's own cached note pages reflect the old
        // publicity — and so does every ancestor's merged
        // `sub:true` page, which keeps serving this tag's
        // notes with the stale `public` flag. The notes cache
        // never expires, so drop it whole (same as
        // deleteNote).
        clearNotesCache();
        await loadTags(true, { silent: true });
      } catch (error) {
        console.error('Error updating tag publicity:', error);
        // apiClient throws catalog keys — textOrKey
        // translates those, passes server text through.
        showNotification({
          title: t('common.error'),
          message:
            error instanceof Error
              ? textOrKey(error.message)
              : t('tags.publicityFailed'),
          color: 'red',
        });
      }
    },
    [loadTags, t]
  );

  const handleTogglePublic = useCallback(
    (tag: Tag) => {
      const makingPublic = !tag.public;
      openConfirmModal({
        title: makingPublic
          ? t('tags.makePublic')
          : t('tags.makePrivate'),
        children: (
          <Text size="sm">
            {makingPublic
              ? t('tags.makePublicBody', { name: tag.name })
              : t('tags.makePrivateBody', { name: tag.name })}
          </Text>
        ),
        labels: {
          confirm: makingPublic
            ? t('tags.makePublicConfirm')
            : t('tags.makePrivateConfirm'),
          cancel: t('common.cancel'),
        },
        // Making private revokes every shared link under the
        // tag — it gets the same red treatment as Delete.
        confirmProps: { color: makingPublic ? 'teal' : 'red' },
        onConfirm: () =>
          void toggleTagPublic(tag, makingPublic),
      });
    },
    [toggleTagPublic, t]
  );

  const handleReparent = useCallback(
    async (tagId: string, parentId: string | null) => {
      // One reparent write at a time — further drops are
      // ignored while the PATCH is in flight.
      if (reparentingRef.current) return;
      reparentingRef.current = true;
      setRefreshing(true);
      try {
        await reparentTag(tagId, parentId);
        showNotification({
          title: t('common.success'),
          message: t('tags.moved'),
          color: 'green',
        });
        // The moved tag's notes shift between merged views:
        // every `sub:true` page cached under an old or new
        // ancestor is stale now, and the notes cache never
        // expires — drop it whole (same as deleteNote).
        clearNotesCache();
        await loadTags(true, { silent: true });
      } catch (error) {
        console.error('Error reparenting tag:', error);
        // The API helper surfaces the server's message (e.g.
        // a same-named sibling already exists under the
        // target parent). textOrKey passes that raw text
        // through while translating apiClient's catalog-key
        // errors ('errors.forbidden' etc.).
        showNotification({
          title: t('common.error'),
          message:
            error instanceof Error
              ? textOrKey(error.message)
              : t('tags.moveFailed'),
          color: 'red',
        });
      } finally {
        reparentingRef.current = false;
        setRefreshing(false);
      }
    },
    [loadTags, t]
  );

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingTag(null);
  }, []);

  const refreshTagsSilently = useCallback(() => {
    void loadTags(true, { silent: true });
  }, [loadTags]);

  // Matching a child must keep its ancestors in the list —
  // otherwise the tree renders the match as a root and the
  // hierarchy (and the path to it) is lost.
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags]
  );
  // Derived counts — memoized on `tags` so rows never redo the
  // subtree walk per render (perf: derived state, not
  // per-render work).
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tag of tags) {
      counts[tag.id] = tag.note_count ?? 0;
    }
    return counts;
  }, [tags]);
  const subtreeCounts = useMemo(
    () => computeSubtreeCounts(buildTagTree(tags)),
    [tags]
  );
  const filteredTags = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tags;
    const keep = new Set<string>();
    for (const tag of tags) {
      if (!tag.name.toLowerCase().includes(query)) continue;
      let current: Tag | undefined = tag;
      while (current && !keep.has(current.id)) {
        keep.add(current.id);
        current = current.parent_tag
          ? tagById.get(current.parent_tag)
          : undefined;
      }
    }
    return tags.filter((tag) => keep.has(tag.id));
  }, [tags, searchQuery, tagById]);
  const searching = searchQuery.trim().length > 0;

  if (initialLoading && tags.length === 0) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label={t('tags.loading')} />
      </Center>
    );
  }

  if (initialError && tags.length === 0) {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" spacing="sm">
          <Text color="red" size="lg">
            {t('tags.loadFailed')}
          </Text>
          <Button
            variant="light"
            onClick={() => void loadTags(true)}
          >
            {t('common.retry')}
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Box
      p={compact ? 'sm' : 'md'}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Group position="apart" mb={compact ? 'sm' : 'lg'} noWrap>
        <Title order={compact ? 3 : 2}>
          {t('menu.tagManagement')}
        </Title>
        {compact ? (
          <ActionIcon
            variant="filled"
            size="lg"
            onClick={handleCreateTag}
            title={t('tags.new')}
          >
            <IconPlus size={20} />
          </ActionIcon>
        ) : (
          <Button
            leftIcon={<IconPlus size={16} />}
            onClick={handleCreateTag}
          >
            {t('tags.new')}
          </Button>
        )}
      </Group>

      <Group spacing="xs" mb="md" noWrap>
        <TextInput
          placeholder={t('tags.searchPlaceholder')}
          icon={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(e) =>
            setSearchQuery(e.currentTarget.value)
          }
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: compact ? undefined : 400,
          }}
        />
        {filteredTags.length > 0 && (
          <>
            <Text
              color="dimmed"
              size="sm"
              sx={{ whiteSpace: 'nowrap' }}
            >
              {t('tags.tagCount', {
                count: filteredTags.length,
              })}
              {noteTotal !== null &&
                ` · ${t('tags.noteCount', {
                  count: noteTotal,
                })}`}
            </Text>
            {refreshing && <Loader size="xs" />}
          </>
        )}
      </Group>

      {filteredTags.length === 0 ? (
        <Center style={{ flex: 1, minHeight: 0 }}>
          <Stack align="center" spacing="xs">
            <Text color="dimmed">
              {searchQuery
                ? t('tags.noTagsSearch')
                : t('tags.noTags')}
            </Text>
            {!searchQuery && (
              <Button
                variant="light"
                leftIcon={<IconPlus size={16} />}
                onClick={handleCreateTag}
              >
                {t('tags.createFirst')}
              </Button>
            )}
          </Stack>
        </Center>
      ) : (
        <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
          <TagTree
            tags={filteredTags}
            onEdit={handleEditTag}
            onDelete={handleDeleteTag}
            onViewNotes={handleViewNotes}
            noteCounts={noteCounts}
            subtreeCounts={subtreeCounts}
            onTogglePublic={handleTogglePublic}
            onReparent={handleReparent}
            // Drag reparent is off while a search filter
            // hides part of the hierarchy — the drop guards
            // walk the FILTERED list, so a cycle through a
            // hidden ancestor could slip past the
            // client-side check and surface as a 400 toast.
            reparentEnabled={!searching}
            forceExpand={searching}
          />
        </ScrollArea>
      )}

      <CreateTagModal
        opened={createModalOpen}
        onClose={closeCreateModal}
        onSuccess={refreshTagsSilently}
        existingTags={tags}
      />

      <EditTagModal
        opened={!!editingTag}
        onClose={closeEditModal}
        onSuccess={refreshTagsSilently}
        tag={editingTag}
        existingTags={tags}
      />
    </Box>
  );
}
