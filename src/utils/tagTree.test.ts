import { describe, it, expect } from 'vitest';
import {
  buildTagTree,
  isTagDescendant,
  validateTagName,
} from './tagTree';
import type { Tag } from '../types';

const tag = (
  id: string,
  name: string,
  parent_tag: string | null = null
): Tag => ({
  id,
  name,
  parent_tag,
  created_at: '',
  updated_at: '',
});

describe('buildTagTree', () => {
  it('returns [] for no tags', () => {
    expect(buildTagTree([])).toEqual([]);
  });

  it('nests children under their parents', () => {
    const tree = buildTagTree([
      tag('child', 'Child', 'root'),
      tag('root', 'Root'),
      tag('grand', 'Grand', 'child'),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].tag.id).toBe('root');
    expect(tree[0].children[0].tag.id).toBe('child');
    expect(tree[0].children[0].children[0].tag.id)
      .toBe('grand');
  });

  it('sorts siblings by name at every level', () => {
    const tree = buildTagTree([
      tag('b', 'Beta'),
      tag('a', 'Alpha'),
      tag('z', 'Zeta', 'a'),
      tag('y', 'Yankee', 'a'),
    ]);

    expect(tree.map((n) => n.tag.id)).toEqual(['a', 'b']);
    expect(tree[0].children.map((n) => n.tag.id))
      .toEqual(['y', 'z']);
  });

  it('promotes orphans whose parent is missing to roots', () => {
    const tree = buildTagTree([
      tag('orphan', 'Orphan', 'gone'),
      tag('root', 'Root'),
    ]);

    expect(tree.map((n) => n.tag.id))
      .toEqual(['orphan', 'root']);
  });
});

describe('isTagDescendant', () => {
  const tags = [
    tag('root', 'Root'),
    tag('child', 'Child', 'root'),
    tag('grand', 'Grand', 'child'),
    tag('other', 'Other'),
  ];

  it('detects direct and transitive descendants', () => {
    expect(isTagDescendant(tags, 'root', 'child')).toBe(true);
    expect(isTagDescendant(tags, 'root', 'grand')).toBe(true);
  });

  it('is false for ancestors, roots, and unrelated tags', () => {
    expect(isTagDescendant(tags, 'child', 'root')).toBe(false);
    expect(isTagDescendant(tags, 'root', 'other')).toBe(false);
    expect(isTagDescendant(tags, 'root', 'root')).toBe(false);
    expect(isTagDescendant(tags, 'root', 'missing')).toBe(false);
  });

  it('terminates on cyclic parent data', () => {
    const cyclic = [
      tag('a', 'A', 'b'),
      tag('b', 'B', 'a'),
    ];
    expect(isTagDescendant(cyclic, 'x', 'a')).toBe(false);
    expect(isTagDescendant(cyclic, 'a', 'b')).toBe(true);
  });
});

describe('validateTagName', () => {
  const existing = [
    tag('t1', 'Bible Study'),
    tag('t2', 'Sermons'),
  ];

  it('rejects blank names', () => {
    expect(validateTagName('', existing))
      .toBe('Tag name is required');
    expect(validateTagName('   ', existing))
      .toBe('Tag name is required');
  });

  it('rejects names over 100 characters', () => {
    expect(validateTagName('x'.repeat(101), existing))
      .toBe('Tag name must be 100 characters or less');
    expect(validateTagName('x'.repeat(100), existing))
      .toBeNull();
  });

  it('rejects case-insensitive duplicates', () => {
    expect(validateTagName('bible study', existing))
      .toBe('A tag with this name already exists');
    expect(validateTagName('  Sermons  ', existing))
      .toBe('A tag with this name already exists');
  });

  it('lets the edited tag keep its own name via ' +
    'excludeTagId', () => {
    expect(validateTagName('Bible Study', existing, 't1'))
      .toBeNull();
    expect(validateTagName('Sermons', existing, 't1'))
      .toBe('A tag with this name already exists');
  });

  it('accepts a fresh name', () => {
    expect(validateTagName('New Tag', existing)).toBeNull();
  });
});
