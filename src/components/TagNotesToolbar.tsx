import { useMemo } from 'react';
import {
  ActionIcon,
  Group,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconRefresh,
  IconShare,
} from '@tabler/icons-react';
import { UNTAGGED_TAG_ID } from '../api';
import type { Tag } from '../types';
import type { SortOrder } from '../utils/noteSorting';
import { shareOrCopyLink } from '../utils/share';

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
  onTagChange,
  onSortChange,
  onPageSizeChange,
  onToggleFolded,
  onRefresh,
}: TagNotesToolbarProps) => {
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags]
  );

  const handleShare = async () => {
    await shareOrCopyLink(
      {
        title: `Notes: ${tagName || 'Tag'}`,
        // totalCount is the tag total; shownCount is only
        // the currently loaded page.
        text:
          `Check out these ${totalCount} note(s) ` +
          `tagged with "${tagName}"`,
        url: window.location.href,
      },
      {
        shareSuccess: {
          title: 'Shared!',
          message: 'Link shared successfully',
        },
        copySuccess: {
          title: 'Link Copied!',
          message: 'Tag link copied to clipboard',
        },
        copyFailure: {
          title: 'Error',
          message: 'Failed to copy link',
        },
      }
    );
  };

  return (
    <Stack spacing="sm" mb="md">
      {isAuthenticated && sortedTags.length > 0 ? (
        <Select
          label="Filter by tag"
          placeholder="Select a tag"
          value={tagId}
          onChange={onTagChange}
          // Grouped items render above a divider; the
          // ungrouped "Untagged" entry lands in its own
          // bottom section (Mantine v6 SelectItems).
          data={[
            ...sortedTags.map((t) => ({
              value: t.id,
              label: t.name,
              group: 'Tags',
            })),
            { value: UNTAGGED_TAG_ID, label: 'Untagged' },
          ]}
          searchable
          style={{ maxWidth: 400 }}
        />
      ) : (
        <Text fw={500} size="lg">{tagName}</Text>
      )}
      <Group spacing="xs" position="apart">
        <Group spacing="xs" noWrap>
          <Select
            size="xs"
            value={sortOrder}
            onChange={(v) => {
              if (v) {
                onSortChange(v);
              }
            }}
            data={[
              {
                value: 'custom_asc',
                label: 'Custom: Ascending',
              },
              {
                value: 'custom_desc',
                label: 'Custom: Descending',
              },
              {
                value: 'created_desc',
                label: 'Date: Newest first',
              },
              {
                value: 'created_asc',
                label: 'Date: Oldest first',
              },
              {
                value: 'verse_asc',
                label: 'Verse: Ascending',
              },
              {
                value: 'verse_desc',
                label: 'Verse: Descending',
              },
            ]}
            style={{ width: 170, flexShrink: 0 }}
          />
          <Select
            size="xs"
            value={String(pageSize)}
            onChange={onPageSizeChange}
            data={[
              { value: '5', label: '5' },
              { value: '25', label: '25' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
            style={{ width: 60, flexShrink: 0 }}
          />
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
            {shownCount}
            {totalCount > shownCount && ` of ${totalCount}`}
            {' '}
            {shownCount === 1 ? 'note' : 'notes'}
          </Text>
          <Tooltip
            label={versesFolded ? "Unfold verses" : "Fold verses"}
            position="left"
          >
            <ActionIcon
              onClick={onToggleFolded}
              variant="subtle"
              color={versesFolded ? "blue" : "gray"}
              size="lg"
              aria-label="toggle-verse-fold"
            >
              {versesFolded
                ? <IconArrowsMaximize size={20} />
                : <IconArrowsMinimize size={20} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh notes" position="left">
            <ActionIcon
              onClick={onRefresh}
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="refresh-notes"
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Share tag link" position="left">
            <ActionIcon
              onClick={handleShare}
              variant="subtle"
              color="blue"
              size="lg"
              aria-label="share-tag-link"
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
