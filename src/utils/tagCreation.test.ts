import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  splitPathQuery,
  resolvePath,
  createTagPath,
  deleteUnusedCreatedTags,
} from './tagCreation';
import { createTag, deleteTag, getTags } from '../api';
import type { Tag } from '../types';

vi.mock('../api', () => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getTags: vi.fn(),
}));

const tag = (
  id: string,
  name: string,
  parent_tag: string | null = null,
  note_count = 0
): Tag => ({
  id,
  name,
  parent_tag,
  note_count,
  public: false,
  created_at: '',
  updated_at: '',
});

const mockedCreate = vi.mocked(createTag);
const mockedDelete = vi.mocked(deleteTag);
const mockedGetTags = vi.mocked(getTags);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('splitPathQuery', () => {
  it('returns null without a slash', () => {
    expect(splitPathQuery('design')).toBeNull();
  });

  it('splits a two-segment path', () => {
    expect(splitPathQuery('Work/design')).toEqual([
      'Work',
      'design',
    ]);
  });

  it('trims segments and drops empty ones', () => {
    expect(splitPathQuery(' a // b /')).toEqual(['a', 'b']);
  });

  it('treats a single effective segment as a literal name', () => {
    expect(splitPathQuery('Work/')).toBeNull();
    expect(splitPathQuery('/x')).toBeNull();
    expect(splitPathQuery('/')).toBeNull();
  });
});

describe('resolvePath', () => {
  const tags = [
    tag('1', 'Work'),
    tag('2', 'design', '1'),
    tag('3', 'School'),
  ];

  it('matches the existing chain', () => {
    const { existing, missing } = resolvePath(tags, [
      'Work',
      'design',
    ]);
    expect(existing.map((t) => t.id)).toEqual(['1', '2']);
    expect(missing).toEqual([]);
  });

  it('matches case-insensitively and reports the tail', () => {
    const { existing, missing } = resolvePath(tags, [
      'work',
      'docs',
      'deep',
    ]);
    expect(existing.map((t) => t.id)).toEqual(['1']);
    expect(missing).toEqual(['docs', 'deep']);
  });

  it('scopes matching to the chosen parent', () => {
    const { existing, missing } = resolvePath(
      tags,
      ['design'],
      '3'
    );
    expect(existing).toEqual([]);
    expect(missing).toEqual(['design']);
  });
});

describe('createTagPath', () => {
  it('creates a single top-level tag', async () => {
    const made = tag('9', 'design');
    mockedCreate.mockResolvedValue(made);
    const { leaf, created } = await createTagPath('design', []);
    expect(mockedCreate).toHaveBeenCalledWith('design', null);
    expect(leaf).toEqual(made);
    expect(created).toEqual([made]);
  });

  it('reuses existing ancestors and creates the tail', async () => {
    const work = tag('1', 'Work');
    const made = tag('9', 'design', '1');
    mockedCreate.mockResolvedValue(made);
    const { leaf, created } = await createTagPath(
      'Work/design',
      [work]
    );
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith('design', '1');
    expect(leaf).toEqual(made);
    expect(created).toEqual([made]);
  });

  it('creates a full missing chain root→leaf', async () => {
    mockedCreate
      .mockResolvedValueOnce(tag('1', 'a'))
      .mockResolvedValueOnce(tag('2', 'b', '1'));
    const { leaf, created } = await createTagPath('a/b', []);
    expect(mockedCreate).toHaveBeenNthCalledWith(1, 'a', null);
    expect(mockedCreate).toHaveBeenNthCalledWith(2, 'b', '1');
    expect(leaf.id).toBe('2');
    expect(created.map((t) => t.id)).toEqual(['1', '2']);
  });

  it('anchors the chain under a chosen parent', async () => {
    mockedCreate.mockResolvedValue(tag('9', 'design', '3'));
    await createTagPath('design', [tag('3', 'School')], '3');
    expect(mockedCreate).toHaveBeenCalledWith('design', '3');
  });

  it('rolls back created tags deepest-first on failure', async () => {
    const a = tag('1', 'a');
    const b = tag('2', 'b', '1');
    mockedCreate
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b)
      .mockRejectedValueOnce(new Error('nope'));
    mockedDelete.mockResolvedValue(undefined);
    await expect(createTagPath('a/b/c', [])).rejects.toThrow(
      'nope'
    );
    expect(mockedDelete).toHaveBeenNthCalledWith(1, '2');
    expect(mockedDelete).toHaveBeenNthCalledWith(2, '1');
  });

  it('still throws when a rollback delete fails', async () => {
    mockedCreate
      .mockResolvedValueOnce(tag('1', 'a'))
      .mockRejectedValueOnce(new Error('nope'));
    mockedDelete.mockRejectedValue(new Error('delete fail'));
    await expect(createTagPath('a/b', [])).rejects.toThrow('nope');
  });

  it('selects the existing leaf when the path exists', async () => {
    const design = tag('2', 'design', '1');
    const { leaf, created } = await createTagPath(
      'Work/design',
      [tag('1', 'Work'), design]
    );
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(leaf).toEqual(design);
    expect(created).toEqual([]);
  });
});

describe('deleteUnusedCreatedTags', () => {
  it('deletes created tags deepest-first when unused', async () => {
    const a = tag('1', 'a');
    const b = tag('2', 'b', '1');
    mockedGetTags.mockResolvedValue([a, b]);
    mockedDelete.mockResolvedValue(undefined);
    const { deleted, kept } = await deleteUnusedCreatedTags([
      a,
      b,
    ]);
    expect(mockedDelete).toHaveBeenNthCalledWith(1, '2');
    expect(mockedDelete).toHaveBeenNthCalledWith(2, '1');
    expect(deleted.map((t) => t.id)).toEqual(['2', '1']);
    expect(kept).toEqual([]);
  });

  it('keeps a tag that gained notes', async () => {
    const a = tag('1', 'a', null, 3);
    mockedGetTags.mockResolvedValue([a]);
    const { deleted, kept } = await deleteUnusedCreatedTags([a]);
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(kept.map((t) => t.id)).toEqual(['1']);
  });

  it('keeps a tag with a foreign child but deletes its leaf', async () => {
    const a = tag('1', 'a');
    const b = tag('2', 'b', '1');
    const x = tag('3', 'x', '1'); // foreign child of a
    mockedGetTags.mockResolvedValue([a, b, x]);
    mockedDelete.mockResolvedValue(undefined);
    const { deleted, kept } = await deleteUnusedCreatedTags([
      a,
      b,
    ]);
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith('2');
    expect(deleted.map((t) => t.id)).toEqual(['2']);
    expect(kept.map((t) => t.id)).toEqual(['1']);
  });

  it('keeps a tag whose delete call fails', async () => {
    const a = tag('1', 'a');
    mockedGetTags.mockResolvedValue([a]);
    mockedDelete.mockRejectedValue(new Error('boom'));
    const { kept } = await deleteUnusedCreatedTags([a]);
    expect(kept.map((t) => t.id)).toEqual(['1']);
  });

  it('skips tags already gone', async () => {
    const a = tag('1', 'a');
    mockedGetTags.mockResolvedValue([]);
    const { deleted } = await deleteUnusedCreatedTags([a]);
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });
});
