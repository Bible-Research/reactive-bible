import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Input,
  Loader,
  Popover,
  ScrollArea,
  Text,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChevronDown,
  IconPlus,
  IconTag,
} from '@tabler/icons-react';
import type { Tag } from '../types';
import { reparentTag } from '../api';
import { useBibleStore } from '../store';
import {
  isExactPathMatch,
  isTagDescendant,
  isTopLevelNameTaken,
  matchTagQuery,
  tagPath,
} from '../utils/tagTree';
import {
  createTagPath,
  deleteUnusedCreatedTags,
  splitPathQuery,
} from '../utils/tagCreation';
import { TagActionToast } from './TagActionToast';
import type { TagToast } from './TagActionToast';

/** One interactive row in the dropdown. */
type Row =
  | { kind: 'tag'; tag: Tag; label: string }
  | { kind: 'create' }
  | { kind: 'create-under' }
  | { kind: 'back' };

/** What the Undo toast needs once the dropdown has closed. */
interface CreatedAction {
  created: Tag[];
  leaf: Tag;
  previousValue: string;
}

/** Path-label alphabetical sort for dropdown lists. */
const sortByPath = (tags: Tag[], list: Tag[]): Tag[] =>
  [...list].sort((a, b) =>
    tagPath(tags, a).localeCompare(tagPath(tags, b))
  );

/**
 * Ids that must not be offered as a Move under… parent:
 * the tag itself plus everything under it (moving a tag
 * beneath its own descendant would create a cycle).
 */
const moveExclusions = (tags: Tag[], target: Tag) =>
  new Set(
    tags
      .filter(
        (t) =>
          t.id === target.id ||
          isTagDescendant(tags, target.id, t.id)
      )
      .map((t) => t.id)
  );

interface TagComboboxProps {
  tags: Tag[];
  /** Selected tag id ('' = none). */
  value: string;
  onChange: (tagId: string) => void;
  onDropdownOpen?: () => void;
  label?: string;
}

/**
 * The note form's tag field: an ARIA combobox that filters
 * existing tags by full path and offers inline creation —
 * `+ Create "<query>"` for a top-level tag, `+ Create
 * "<query>" under…` for a child via an in-dropdown parent
 * picker, and `Parent/child` paths with ancestor reuse.
 *
 * Mantine v6 `Select` only supports a single `creatable`
 * row and no nested pane, so the listbox is hand-rolled on
 * `TextInput` + `Popover`.
 */
export function TagCombobox({
  tags,
  value,
  onChange,
  onDropdownOpen,
  label = 'Tag',
}: TagComboboxProps) {
  const listboxId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<
    'options' | 'parents' | 'move'
  >('options');
  const [highlight, setHighlight] = useState(0);
  const [createQuery, setCreateQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Tag | null>(
    null
  );
  const [toast, setToast] = useState<TagToast | null>(null);

  // Latest values for async callbacks that fire after
  // renders (toast Undo, post-move refresh).
  const valueRef = useRef(value);
  valueRef.current = value;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const actionRef = useRef<CreatedAction | null>(null);

  const selected = tags.find((t) => t.id === value);
  const displayValue = open
    ? search
    : selected
    ? tagPath(tags, selected)
    : '';

  const rows = useMemo<Row[]>(() => {
    if (view === 'parents' || view === 'move') {
      const excluded =
        view === 'move' && moveTarget
          ? moveExclusions(tags, moveTarget)
          : null;
      return [
        { kind: 'back' },
        ...sortByPath(
          tags,
          matchTagQuery(tags, search).filter(
            (t) => !excluded?.has(t.id)
          )
        ).map(
          (tag): Row => ({
            kind: 'tag',
            tag,
            label: tagPath(tags, tag),
          })
        ),
      ];
    }
    const out: Row[] = sortByPath(
      tags,
      matchTagQuery(tags, search)
    ).map((tag) => ({
      kind: 'tag',
      tag,
      label: tagPath(tags, tag),
    }));
    const query = search.trim();
    // Slash-typed paths that already exist offer the
    // existing tag, never the create rows; a literal name
    // that only duplicates a top-level tag still gets
    // `under…` (same-named children are legal).
    const pathTaken =
      splitPathQuery(query) !== null &&
      isExactPathMatch(tags, query);
    if (query && !pathTaken) {
      if (
        splitPathQuery(query) !== null ||
        !isTopLevelNameTaken(tags, query)
      ) {
        out.push({ kind: 'create' });
      }
      out.push({ kind: 'create-under' });
    }
    return out;
  }, [tags, search, view, moveTarget]);

  const closeAll = () => {
    setOpen(false);
    setView('options');
    setSearch('');
    setCreateQuery('');
  };

  const openDrop = () => {
    if (open) return;
    setOpen(true);
    setView('options');
    setSearch('');
    setHighlight(0);
    onDropdownOpen?.();
  };

  const openParentPicker = () => {
    setCreateQuery(search.trim());
    setSearch('');
    setView('parents');
    // Land on the first parent, not the ‹ Back row.
    setHighlight(matchTagQuery(tags, '').length > 0 ? 1 : 0);
  };

  const backToOptions = () => {
    setView('options');
    setSearch(view === 'parents' ? createQuery : '');
    setHighlight(0);
  };

  /**
   * The toast's Move under… reopens the dropdown in 'move'
   * view — the same searchable parent pane used by
   * `under…`, minus the tag and its descendants. A nested
   * `Modal` would portal outside the note modal and land
   * under its `aria-hidden`, unreachable to AT.
   */
  const startMove = () => {
    const action = actionRef.current;
    if (!action) return;
    setMoveTarget(action.leaf);
    const excluded = moveExclusions(
      tagsRef.current,
      action.leaf
    );
    const hasParents = tagsRef.current.some(
      (t) => !excluded.has(t.id)
    );
    setOpen(true);
    setView('move');
    setSearch('');
    setHighlight(hasParents ? 1 : 0);
    inputRef.current?.focus();
  };

  const refreshTags = () =>
    useBibleStore.getState().getTags(true).catch(() => {
      // A failed refresh only leaves labels stale — the
      // created tag is still selected by id.
    });

  const dismissToast = useCallback(
    () => setToast(null),
    []
  );

  const handleUndo = async () => {
    const action = actionRef.current;
    if (!action) return;
    actionRef.current = null;
    // Revert only when the user hasn't picked another tag —
    // a deliberately changed selection must not be
    // clobbered by a late Undo.
    if (valueRef.current === action.leaf.id) {
      onChange(action.previousValue);
    }
    try {
      const { deleted, kept } =
        await deleteUnusedCreatedTags(action.created);
      const keptNote =
        kept.length > 0
          ? ` Kept in use: ${kept
              .map((t) => t.name)
              .join(', ')}.`
          : '';
      setToast({
        title: 'Tag creation undone',
        message:
          deleted.length > 0
            ? `Deleted ${deleted
                .map((t) => t.name)
                .join(', ')}.${keptNote}`
            : keptNote.trim() || 'Nothing left to undo.',
        color: kept.length > 0 ? 'yellow' : 'green',
        actions: false,
      });
    } catch {
      setToast({
        title: 'Error',
        message: 'Failed to undo tag creation.',
        color: 'red',
        actions: false,
      });
    }
    void refreshTags();
  };

  const handleMove = async (parentTagId: string) => {
    const target = moveTarget;
    if (!target) return;
    try {
      await reparentTag(target.id, parentTagId);
      setMoveTarget(null);
      closeAll();
      await refreshTags();
      const fresh = useBibleStore.getState().tags;
      const moved = fresh.find((t) => t.id === target.id);
      setToast({
        title: 'Tag moved',
        message: moved ? tagPath(fresh, moved) : target.name,
        color: 'green',
        actions: false,
      });
    } catch (error) {
      setMoveTarget(null);
      closeAll();
      setToast({
        title: 'Error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to move tag',
        color: 'red',
        actions: false,
      });
    }
  };

  const runCreate = async (parentTagId: string | null) => {
    const query = (
      view === 'parents' ? createQuery : search
    ).trim();
    if (!query || busy) return;
    setBusy(true);
    const previousValue = value;
    try {
      const { leaf, created } = await createTagPath(
        query,
        tagsRef.current,
        parentTagId
      );
      onChange(leaf.id);
      closeAll();
      void refreshTags();
      if (created.length > 0) {
        const leafLabel = tagPath(
          [...tagsRef.current, ...created],
          leaf
        );
        actionRef.current = {
          created,
          leaf,
          previousValue,
        };
        setToast({
          title: 'Tag created',
          message: leafLabel,
          actions: true,
        });
      }
    } catch {
      setToast({
        title: 'Error',
        message: 'Failed to create tag. Please try again.',
        color: 'red',
        actions: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const activate = (row: Row) => {
    if (busy) return;
    switch (row.kind) {
      case 'tag':
        if (view === 'parents') {
          void runCreate(row.tag.id);
        } else if (view === 'move') {
          void handleMove(row.tag.id);
        } else {
          onChange(row.tag.id);
          closeAll();
        }
        return;
      case 'back':
        backToOptions();
        return;
      case 'create':
        void runCreate(null);
        return;
      case 'create-under':
        openParentPicker();
        return;
    }
  };

  const optionId = (index: number) =>
    `${listboxId}-opt-${index}`;

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openDrop();
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) =>
        rows.length > 0
          ? (h + delta + rows.length) % rows.length
          : 0
      );
      return;
    }
    if (event.key === 'Enter') {
      if (!open) return; // let the form submit
      event.preventDefault();
      const row = rows[highlight];
      if (row) activate(row);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      const row = rows[highlight];
      if (
        open &&
        view === 'options' &&
        row?.kind === 'create-under'
      ) {
        event.preventDefault();
        openParentPicker();
      } else if (event.key === 'Tab' && open) {
        closeAll();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (view !== 'options' && open) {
        event.preventDefault();
        // Keep Esc from also closing the surrounding modal.
        event.stopPropagation();
        backToOptions();
      } else if (open) {
        event.preventDefault();
        event.stopPropagation();
        closeAll();
      }
    }
  };

  const rowLabel = (row: Row): string => {
    const query = search.trim();
    switch (row.kind) {
      case 'tag':
        return row.label;
      case 'create':
        return `+ Create "${query}"`;
      case 'create-under':
        return `+ Create "${query}" under…`;
      case 'back':
        return '‹ Back';
    }
  };

  const rowIcon = (row: Row) => {
    switch (row.kind) {
      case 'tag':
        return view === 'parents' ? null : (
          <IconTag size={14} />
        );
      case 'back':
        return <IconArrowLeft size={14} />;
      default:
        return <IconPlus size={14} />;
    }
  };

  return (
    <>
      {/* Label lives on Input.Wrapper, outside
          Popover.Target — Mantine aria-labelledbys the
          dropdown with the target subtree's text, and a
          label inside would make the dropdown itself answer
          to getByLabelText('Tag'). The extra div is needed:
          Popover.Target force-overrides its direct child's
          id, which would break the label's htmlFor. */}
      <Input.Wrapper
        id={inputId}
        label={label}
        variant="transparent"
      >
        <Popover
          opened={open}
          position="bottom-start"
          width="target"
          trapFocus={false}
          onClose={closeAll}
        >
          <Popover.Target>
            <div>
              <Input
                id={inputId}
                ref={inputRef}
                variant="transparent"
              placeholder="Select a tag"
              value={displayValue}
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={
                open && rows[highlight]
                  ? optionId(highlight)
                  : undefined
              }
              onFocus={(event) =>
                event.currentTarget.select()
              }
              onMouseDown={() => {
                if (!open) openDrop();
              }}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setHighlight(0);
                if (!open) {
                  setOpen(true);
                  setView('options');
                  onDropdownOpen?.();
                }
              }}
              onKeyDown={handleKeyDown}
              rightSection={
                busy ? (
                  <Loader size="xs" />
                ) : (
                  <IconChevronDown size={16} />
                )
              }
              />
            </div>
          </Popover.Target>
          <Popover.Dropdown p={4}>
          <ScrollArea
            mah={window.innerHeight * 0.7}
            type="auto"
          >
            <div
              role="listbox"
              id={listboxId}
              aria-label={
                view === 'parents'
                  ? `Create "${createQuery}" under`
                  : view === 'move'
                  ? `Move "${moveTarget?.name ?? ''}" under`
                  : 'Tags'
              }
            >
              {view !== 'options' && (
                <Text
                  size="xs"
                  color="dimmed"
                  px="sm"
                  py={4}
                >
                  {view === 'parents'
                    ? `Create “${createQuery}” under:`
                    : `Move “${moveTarget?.name}” under:`}
                </Text>
              )}
              {rows.length === 0 && (
                <Text
                  size="sm"
                  color="dimmed"
                  px="sm"
                  py={4}
                >
                  {view === 'parents'
                    ? 'No parent tags'
                    : 'No tags'}
                </Text>
              )}
              {rows.map((row, index) => {
                const highlighted = index === highlight;
                return (
                  <Box
                    key={`${row.kind}-${
                      row.kind === 'tag' ? row.tag.id : index
                    }`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={
                      row.kind === 'tag' &&
                      view === 'options'
                        ? row.tag.id === value
                        : false
                    }
                    data-highlighted={
                      highlighted || undefined
                    }
                    aria-disabled={busy || undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      activate(row);
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    sx={(theme) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      fontSize: theme.fontSizes.sm,
                      cursor: busy ? 'default' : 'pointer',
                      borderRadius: theme.radius.sm,
                      backgroundColor: highlighted
                        ? theme.colorScheme === 'dark'
                          ? theme.colors.dark[5]
                          : theme.colors.blue[0]
                        : 'transparent',
                    })}
                  >
                    {rowIcon(row)}
                    <span>{rowLabel(row)}</span>
                  </Box>
                );
              })}
            </div>
          </ScrollArea>
          </Popover.Dropdown>
        </Popover>
      </Input.Wrapper>
      <TagActionToast
        toast={toast}
        onUndo={() => void handleUndo()}
        onMoveUnder={startMove}
        onClose={dismissToast}
      />
    </>
  );
}

export default TagCombobox;
