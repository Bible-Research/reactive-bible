import { describe, it, expect } from 'vitest';
import {
  buildTagTree,
  isTagDescendant,
  validateTagName,
  tagPath,
  matchTagQuery,
  isExactPathMatch,
  isTopLevelNameTaken,
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
  public: false,
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

describe('tagPath', () => {
  it('labels a root tag with its bare name', () => {
    const tags = [tag('1', 'Work')];
    expect(tagPath(tags, tags[0])).toBe('Work');
  });

  it('joins ancestors root to leaf', () => {
    const tags = [
      tag('1', 'Work'),
      tag('2', 'design', '1'),
      tag('3', 'ui', '2'),
    ];
    expect(tagPath(tags, tags[2])).toBe('Work › design › ui');
  });

  it('treats a missing parent as root', () => {
    const tags = [tag('2', 'design', 'gone')];
    expect(tagPath(tags, tags[0])).toBe('design');
  });

  it('does not loop on a parent cycle', () => {
    const tags = [tag('1', 'a', '2'), tag('2', 'b', '1')];
    expect(tagPath(tags, tags[0])).toBe('b › a');
  });
});

describe('matchTagQuery', () => {
  const tags = [
    tag('1', 'Work'),
    tag('2', 'design', '1'),
    tag('3', 'School'),
    tag('4', 'design', '3'),
  ];

  it('returns everything on an empty query', () => {
    expect(matchTagQuery(tags, '  ')).toEqual(tags);
  });

  it('matches child names through the path', () => {
    const hits = matchTagQuery(tags, 'design');
    expect(hits.map((t) => t.id)).toEqual(['2', '4']);
  });

  it('treats a slash query as a path match', () => {
    const hits = matchTagQuery(tags, 'Work/design');
    expect(hits.map((t) => t.id)).toEqual(['2']);
  });

  it('matches ancestor prefixes case-insensitively', () => {
    const hits = matchTagQuery(tags, 'work');
    expect(hits.map((t) => t.id)).toEqual(['1', '2']);
  });
});

describe('isExactPathMatch', () => {
  const tags = [tag('1', 'Work'), tag('2', 'design', '1')];

  it('matches a slash query against the full path', () => {
    expect(isExactPathMatch(tags, 'Work/design')).toBe(true);
    expect(isExactPathMatch(tags, 'work / design')).toBe(true);
    expect(isExactPathMatch(tags, 'work')).toBe(true);
    expect(isExactPathMatch(tags, 'design')).toBe(false);
    expect(isExactPathMatch(tags, 'Work/other')).toBe(false);
  });
});

describe('isTopLevelNameTaken', () => {
  const tags = [
    tag('1', 'Work'),
    tag('2', 'design', '1'),
  ];

  it('is true for a top-level name case-insensitively', () => {
    expect(isTopLevelNameTaken(tags, 'work')).toBe(true);
    expect(isTopLevelNameTaken(tags, ' WORK ')).toBe(true);
  });

  it('is false when the name only exists nested', () => {
    expect(isTopLevelNameTaken(tags, 'design')).toBe(false);
    expect(isTopLevelNameTaken(tags, 'other')).toBe(false);
  });
});
