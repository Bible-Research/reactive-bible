import {
  useCallback,
  useEffect,
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
  // The just-created leaf isn't in `tags` until the
  // refresh resolves — fall back to the action record so
  // the closed field isn't blank meanwhile.
  const displayTag =
    selected ??
    (actionRef.current?.leaf.id === value
      ? actionRef.current.leaf
      : undefined);
  const displayValue = open
    ? search
    : displayTag
    ? tagPath(
        selected
          ? tags
          : [...tags, ...(actionRef.current?.created ?? [])],
        displayTag
      )
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
    // A separator-bearing query that exactly names an
    // existing path — typed `Work/design` or pasted
    // `Work › design` — offers the existing tag, never the
    // create rows. A literal name that only duplicates a
    // top-level tag still gets `under…` (same-named
    // children are legal).
    const pathTaken =
      /[/›]/.test(query) && isExactPathMatch(tags, query);
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

  // `rows` can shrink without a reset (a `tags` refresh
  // while open) — clamp rather than leave
  // aria-activedescendant pointing at a gone row.
  const active =
    rows.length > 0
      ? Math.min(highlight, rows.length - 1)
      : 0;

  // Keep the highlighted row visible in the ScrollArea
  // during keyboard navigation of long tag lists.
  useEffect(() => {
    if (open && rows[active]) {
      document
        .getElementById(optionId(active))
        ?.scrollIntoView({ block: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const closeAll = () => {
    if (view === 'move') restoreActionToast();
    setMoveTarget(null);
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

  /**
   * Leaving the 'move' pane without reparenting re-arms
   * the creation toast — otherwise Undo is unreachable
   * while `actionRef` still holds a deleteable tag.
   */
  const restoreActionToast = () => {
    const action = actionRef.current;
    if (!action) return;
    setToast({
      title: 'Tag created',
      message: tagPath(
        [...tagsRef.current, ...action.created],
        action.leaf
      ),
      actions: true,
    });
  };

  const backToOptions = () => {
    if (view === 'move') {
      restoreActionToast();
      setMoveTarget(null);
    }
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
    // Drop the action toast — Undo during a reparent would
    // delete the tag out from under the PATCH.
    setToast(null);
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
    onDropdownOpen?.();
    inputRef.current?.focus();
  };

  const refreshTags = (): Promise<boolean> =>
    useBibleStore
      .getState()
      .getTags(true)
      .then(() => true)
      .catch(() => {
        // A failed refresh only leaves labels stale — the
        // created tag is still selected by id.
        return false;
      });

  const dismissToast = useCallback(
    () => setToast(null),
    []
  );

  const handleUndo = async () => {
    const action = actionRef.current;
    if (!action) return;
    actionRef.current = null;
    // Disarm the buttons immediately — a second click while
    // the sweep is in flight must not re-run it. An open
    // move pane for this action is dead too (reparenting a
    // deleted tag can only fail).
    setToast(null);
    if (view === 'move') closeAll();
    // Revert only when the user hasn't picked another tag —
    // a deliberately changed selection must not be
    // clobbered by a late Undo.
    if (valueRef.current === action.leaf.id) {
      onChange(action.previousValue);
    }
    try {
      const { deleted, kept } =
        await deleteUnusedCreatedTags(action.created);
      // A newer create may have armed its own action toast
      // while the sweep ran — don't clobber it.
      if (actionRef.current === null) {
        const keptNote =
          kept.length > 0
            ? ` Kept: ${kept
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
      }
    } catch {
      // A newer create may be armed — keep its affordance
      // instead of overwriting it with this failure.
      if (actionRef.current !== null) {
        restoreActionToast();
      } else {
        setToast({
          title: 'Error',
          message: 'Failed to undo tag creation.',
          color: 'red',
          actions: false,
        });
      }
    }
    void refreshTags();
  };

  const handleMove = async (parentTagId: string) => {
    const target = moveTarget;
    if (!target || busy) return;
    setBusy(true);
    try {
      await reparentTag(target.id, parentTagId);
      // The reparent commits the tag's position — Undo no
      // longer applies.
      actionRef.current = null;
      setMoveTarget(null);
      closeAll();
      const refreshed = await refreshTags();
      const fresh = useBibleStore.getState().tags;
      const moved = fresh.find((t) => t.id === target.id);
      setToast({
        title: 'Tag moved',
        message:
          refreshed && moved
            ? tagPath(fresh, moved)
            : target.name,
        color: 'green',
        actions: false,
      });
    } catch (error) {
      // Keep `moveTarget` — the pane stays live so the
      // user can retry a different parent — and keep the
      // actions armed for Undo/Move.
      setToast({
        title: 'Failed to move tag',
        message:
          error instanceof Error ? error.message : undefined,
        color: 'red',
        actions: true,
      });
    } finally {
      setBusy(false);
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
        // One pending action at a time — a second create
        // replaces the first's undo affordance (its toast
        // was already replaced visually anyway).
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
    } catch (error) {
      setToast({
        title: 'Error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create tag. Please try again.',
        color: 'red',
        // An earlier successful create may still be armed —
        // don't strand its Undo/Move under… behind this
        // failure.
        actions: actionRef.current !== null,
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
      const row = rows[active];
      if (row) activate(row);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      const row = rows[active];
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
        {/* withinPortal stays explicit: the dropdown must
            render inside the note modal's DOM — a body
            portal is aria-hidden while a modal is open. */}
        <Popover
          opened={open}
          position="bottom-start"
          width="target"
          withinPortal={false}
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
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-controls={open ? listboxId : undefined}
                aria-activedescendant={
                  open && rows[active]
                    ? optionId(active)
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
                  // In the picker panes row 0 is ‹ Back —
                  // land on the first real parent instead.
                  setHighlight(view === 'options' ? 0 : 1);
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
            {/* `mah` on the ScrollArea root leaves Radix's
                inner viewport unconstrained: its height is
                100% of an auto-height parent, so it resolves
                to the content height — nothing overflows the
                viewport, and the root's `overflow:hidden`
                just clips the rest of the list. The cap must
                land on the viewport, which then becomes the
                scroll container (the same job Select's
                flex+maxHeight dropdown wrapper did). */}
            <ScrollArea
              type="auto"
              styles={{
                viewport: { maxHeight: '70vh' },
              }}
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
                    role="presentation"
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
                    role="presentation"
                  >
                    {view !== 'options'
                      ? 'No parent tags'
                      : 'No tags'}
                  </Text>
                )}
                {rows.map((row, index) => {
                  const highlighted = index === active;
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
                        // Primary button only — right-click
                        // keeps its context menu.
                        if (event.button !== 0) return;
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
