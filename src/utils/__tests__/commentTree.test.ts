import { describe, it, expect } from 'vitest';
import {
  insertReply,
  updateNode,
  pruneDeleted,
} from '../commentTree';
import { Comment } from '../../api';

const makeComment = (
  id: string,
  opts: Partial<Comment> = {}
): Comment => ({
  id,
  author: { id: 1, username: 'user' },
  note_id: 'note-1',
  parent_comment: null,
  content: `comment ${id}`,
  timestamp: '2024-01-01T00:00:00Z',
  is_deleted: false,
  replies: [],
  ...opts,
});

describe('insertReply', () => {
  it('appends to root when parentId is null', () => {
    const tree = [makeComment('1')];
    const newC = makeComment('2');
    const result = insertReply(tree, null, newC);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe('2');
  });

  it('inserts as reply to matching parent', () => {
    const tree = [makeComment('1')];
    const newC = makeComment('2', { parent_comment: '1' });
    const result = insertReply(tree, '1', newC);
    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies[0].id).toBe('2');
  });

  it('inserts deep into nested tree', () => {
    const child = makeComment('2', { parent_comment: '1' });
    const tree = [makeComment('1', { replies: [child] })];
    const grandchild = makeComment('3', { parent_comment: '2' });
    const result = insertReply(tree, '2', grandchild);
    expect(result[0].replies[0].replies).toHaveLength(1);
    expect(result[0].replies[0].replies[0].id).toBe('3');
  });

  it('does not mutate the original tree', () => {
    const tree = [makeComment('1')];
    insertReply(tree, null, makeComment('2'));
    expect(tree).toHaveLength(1);
  });
});

describe('updateNode', () => {
  it('applies updater to matching node', () => {
    const tree = [makeComment('1', { content: 'old' })];
    const result = updateNode(tree, '1', (n) => ({
      ...n,
      content: 'new',
    }));
    expect(result[0].content).toBe('new');
  });

  it('applies updater to deep nested node', () => {
    const child = makeComment('2', { content: 'old' });
    const tree = [makeComment('1', { replies: [child] })];
    const result = updateNode(tree, '2', (n) => ({
      ...n,
      content: 'updated',
    }));
    expect(result[0].replies[0].content).toBe('updated');
  });

  it('does not mutate the original tree', () => {
    const tree = [makeComment('1', { content: 'orig' })];
    updateNode(tree, '1', (n) => ({ ...n, content: 'new' }));
    expect(tree[0].content).toBe('orig');
  });
});

describe('pruneDeleted', () => {
  it('keeps non-deleted nodes', () => {
    const tree = [makeComment('1'), makeComment('2')];
    expect(pruneDeleted(tree)).toHaveLength(2);
  });

  it('removes deleted leaf nodes', () => {
    const tree = [
      makeComment('1'),
      makeComment('2', { is_deleted: true }),
    ];
    const result = pruneDeleted(tree);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('keeps deleted node as tombstone if it has surviving replies', () => {
    const reply = makeComment('2', { parent_comment: '1' });
    const tree = [
      makeComment('1', { is_deleted: true, replies: [reply] }),
    ];
    const result = pruneDeleted(tree);
    expect(result).toHaveLength(1);
    expect(result[0].is_deleted).toBe(true);
    expect(result[0].replies).toHaveLength(1);
  });

  it('removes deleted node when all replies are also deleted', () => {
    const reply = makeComment('2', {
      is_deleted: true,
      parent_comment: '1',
    });
    const tree = [
      makeComment('1', { is_deleted: true, replies: [reply] }),
    ];
    const result = pruneDeleted(tree);
    expect(result).toHaveLength(0);
  });

  it('prunes deleted replies but keeps parent', () => {
    const deleted = makeComment('2', {
      is_deleted: true,
      parent_comment: '1',
    });
    const tree = [makeComment('1', { replies: [deleted] })];
    const result = pruneDeleted(tree);
    expect(result[0].replies).toHaveLength(0);
  });
});
