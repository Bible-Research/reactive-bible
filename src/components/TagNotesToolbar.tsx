import { useMemo } from 'react';
import {
  ActionIcon,
  Box,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconRefresh,
  IconShare,
  IconWorld,
} from '@tabler/icons-react';
import { UNTAGGED_TAG_ID } from '../api';
import { TagCombobox } from './TagCombobox';
import type { Tag } from '../types';
import type { SortOrder } from '../utils/noteSorting';
import { NOTES_PAGE_SIZES } from '../utils/pagination';
import { shareOrCopyLink } from '../utils/share';
import { useTranslation } from 'react-i18next';

// Mantine keeps the readonly input focused while the
// dropdown is open, which shows a blinking text caret —
// hide it on non-searchable selects; they are not editable.
// Kept scoped (not a theme override) so searchable selects
// keep their caret.
const READONLY_SELECT_STYLES = {
  input: { caretColor: 'transparent' },
};

interface TagNotesToolbarProps {
  /** The caller's own tags — powers the switcher Select. */
  tags: Tag[];
  isAuthenticated: boolean;
  tagId: string | undefined;
  /** Display name of the tag being viewed. */
  tagName: string;
  sortOrder: SortOrder;
  pageSize: number;
  /** Notes rendered on the current page. */
  shownCount: number;
  /** Server-side total across all pages. */
  totalCount: number;
  versesFolded: boolean;
  /** True when the viewed tag has child tags — gates the
   *  "Include sub-tags" switch. */
  hasChildren?: boolean;
  /** `?descendants=1` — merged subtree notes view is active. */
  includeDescendants?: boolean;
  /** Toggles `descendants` in the URL. */
  onToggleDescendants?: (include: boolean) => void;
  /** Resolved tag's publicity — owner-facing indicator badge. */
  tagPublic?: boolean;
  onTagChange: (tagId: string | null) => void;
  onSortChange: (sortOrder: string) => void;
  onPageSizeChange: (pageSize: string | null) => void;
  onToggleFolded: () => void;
  onRefresh: () => void;
}

/**
 * The TagNotesRoute header bar: tag switcher (or plain tag
 * name for anonymous/shared views), sort + page-size selects,
 * the loaded/total note count, and the fold/refresh/share
 * actions.
 */
const TagNotesToolbar = ({
  tags,
  isAuthenticated,
  tagId,
  tagName,
  sortOrder,
  pageSize,
  shownCount,
  totalCount,
  versesFolded,
  hasChildren = false,
  includeDescendants = false,
  onToggleDescendants,
  tagPublic = false,
  onTagChange,
  onSortChange,
  onPageSizeChange,
  onToggleFolded,
  onRefresh,
}: TagNotesToolbarProps) => {
  const { t } = useTranslation();
  // The virtual "untagged" bucket rides along as a
  // pseudo-tag so the combobox lists and searches it like
  // the real tags.
  const switcherTags = useMemo<Tag[]>(
    () => [
      ...tags,
      {
        id: UNTAGGED_TAG_ID,
        name: t('common.untagged'),
        parent_tag: null,
        public: false,
        created_at: '',
        updated_at: '',
      },
    ],
    [tags, t]
  );

  const handleShare = async () => {
    await shareOrCopyLink(
      {
        title: t('tags.notesTitle', { tag: tagName || t('common.tag') }),
        // totalCount is the tag total; shownCount is only
        // the currently loaded page.
        text: t('tags.shareText', {
          count: totalCount,
          tag: tagName,
        }),
        url: window.location.href,
      },
      {
        shareSuccess: {
          title: t('notes.shared'),
          message: t('tags.linkShared'),
        },
        copySuccess: {
          title: t('notes.linkCopied'),
          message: t('tags.linkCopiedMsg'),
        },
        copyFailure: {
          title: t('common.error'),
          message: t('tags.copyFailed'),
        },
      }
    );
  };

  return (
    <Stack spacing="sm" mb="md">
      <Group spacing="xs" noWrap>
        {isAuthenticated && tags.length > 0 ? (
          // Same path-aware picker as the note form's tag
          // field — minus the creation rows: the switcher
          // only navigates, and a fresh tag would land on
          // an empty page.
          <Box maw={400} style={{ width: '100%' }}>
            <TagCombobox
              label={t('tags.filterByTag')}
              tags={switcherTags}
              value={tagId ?? ''}
              onChange={onTagChange}
              creatable={false}
            />
          </Box>
        ) : (
          <Text fw={500} size="lg">{tagName}</Text>
        )}
        {tagPublic && (
          <Tooltip
            label={t('tags.publicTagLink')}
            position="right"
          >
            <ThemeIcon size="sm" color="teal" variant="light">
              <IconWorld size={12} />
            </ThemeIcon>
          </Tooltip>
        )}
      </Group>
      <Group spacing="xs" position="apart">
        <Group spacing="xs" noWrap>
          <Select
            size="xs"
            aria-label={t('tags.sortOrder')}
            value={sortOrder}
            onChange={(v) => {
              if (v) {
                onSortChange(v);
              }
            }}
            data={[
              {
                value: 'custom_asc',
                label: t('tags.sortCustomAsc'),
              },
              {
                value: 'custom_desc',
                label: t('tags.sortCustomDesc'),
              },
              {
                value: 'created_desc',
                label: t('tags.sortDateNewest'),
              },
              {
                value: 'created_asc',
                label: t('tags.sortDateOldest'),
              },
              {
                value: 'verse_asc',
                label: t('tags.sortVerseAsc'),
              },
              {
                value: 'verse_desc',
                label: t('tags.sortVerseDesc'),
              },
            ]}
            styles={READONLY_SELECT_STYLES}
            style={{ width: 170, flexShrink: 0 }}
          />
          <Select
            size="xs"
            aria-label={t('tags.notesPerPage')}
            value={String(pageSize)}
            onChange={onPageSizeChange}
            data={NOTES_PAGE_SIZES.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            styles={READONLY_SELECT_STYLES}
            style={{ width: 72, flexShrink: 0 }}
          />
          {hasChildren && onToggleDescendants && (
            <Switch
              size="sm"
              label={t('tags.includeSubTags')}
              checked={includeDescendants}
              onChange={(e) =>
                onToggleDescendants(e.currentTarget.checked)
              }
            />
          )}
        </Group>
        <Group spacing="xs" noWrap>
          <Text
            color="dimmed"
            size="sm"
            sx={(theme) => ({
              [theme.fn.smallerThan('sm')]: {
                display: 'none',
              },
            })}
          >
            {totalCount > shownCount
              ? // "3 of 20 notes" — the noun follows the
                // total, which also fixes the former
                // "1 of 20 note" edge.
                t('tags.notesShownOfTotal', {
                  count: totalCount,
                  shown: shownCount,
                  total: totalCount,
                })
              : t('tags.notesShown', {
                  count: shownCount,
                  shown: shownCount,
                })}
          </Text>
          <Tooltip
            label={
              versesFolded
                ? t('tags.unfoldVerses')
                : t('tags.foldVerses')
            }
            position="left"
          >
            <ActionIcon
              onClick={onToggleFolded}
              variant="subtle"
              color={versesFolded ? "blue" : "gray"}
              size="lg"
              aria-label={
                versesFolded ? t('tags.unfoldVerses') : t('tags.foldVerses')
              }
            >
              {versesFolded
                ? <IconArrowsMaximize size={20} />
                : <IconArrowsMinimize size={20} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t('tags.refreshNotes')} position="left">
            <ActionIcon
              onClick={onRefresh}
              variant="subtle"
              color="gray"
              size="lg"
              aria-label={t('tags.refreshNotes')}
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t('tags.shareTagLink')} position="left">
            <ActionIcon
              onClick={handleShare}
              variant="subtle"
              color="blue"
              size="lg"
              aria-label={t('tags.shareTagLink')}
            >
              <IconShare size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Stack>
  );
};

export default TagNotesToolbar;
