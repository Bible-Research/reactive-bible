import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import {
  fetchPendingStagingPrs,
  parseQcSteps,
  StagingPrsError,
} from './stagingPrs';

const PULLS_URL =
  'https://api.github.com/repos/Bible-Research/reactive-bible/pulls';

interface PrFixture {
  number?: number;
  title?: string;
  body?: string | null;
  headRef?: string;
  headSha?: string;
  mergedAt?: string | null;
}

const pr = (f: PrFixture) => ({
  number: f.number ?? 1,
  title: f.title ?? 'Some PR',
  body: f.body ?? '',
  html_url: `https://github.com/x/y/pull/${f.number ?? 1}`,
  merged_at: f.mergedAt === undefined ? '2026-01-01T00:00:00Z' : f.mergedAt,
  head: { ref: f.headRef ?? 'feat/x', sha: f.headSha ?? 'aaa' },
});

const servePulls = (staged: PrFixture[], main: PrFixture[]) => {
  server.use(
    http.get(PULLS_URL, ({ request }) => {
      const base = new URL(request.url).searchParams.get('base');
      return HttpResponse.json(
        (base === 'staging' ? staged : main).map(pr),
      );
    }),
  );
};

describe('fetchPendingStagingPrs', () => {
  it('lists a PR merged into staging with no main promotion',
    async () => {
      servePulls(
        [{ number: 10, title: 'Feat A', headRef: 'feat/a' }],
        [],
      );
      const prs = await fetchPendingStagingPrs();
      expect(prs).toHaveLength(1);
      expect(prs[0]).toMatchObject({ number: 10, title: 'Feat A' });
    });

  it('excludes a PR whose head SHA has a merged main PR (clean ' +
    'squash)', async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a', headSha: 'sha1',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/a', headSha: 'sha1',
          mergedAt: '2026-01-02T00:00:00Z',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(0);
    });

  it('excludes a replay-promoted PR (later main merge, ' +
    'different SHA)', async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a', headSha: 'sha1',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/a', headSha: 'replay-sha',
          mergedAt: '2026-01-03T00:00:00Z',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(0);
    });

  it('keeps a PR whose earlier main merge predates the staging ' +
    'merge (reused branch)', async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a', headSha: 'sha2',
          mergedAt: '2026-02-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/a', headSha: 'sha1',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(1);
    });

  it('dedupes to the latest merged staging PR per head branch',
    async () => {
      servePulls(
        [
          {
            number: 10, title: 'Old', headRef: 'feat/a',
            mergedAt: '2026-01-01T00:00:00Z',
          },
          {
            number: 12, title: 'New', headRef: 'feat/a',
            mergedAt: '2026-01-05T00:00:00Z',
          },
        ],
        [],
      );
      const prs = await fetchPendingStagingPrs();
      expect(prs).toHaveLength(1);
      expect(prs[0].number).toBe(12);
    });

  it('ignores unmerged closed PRs and main/staging head refs',
    async () => {
      servePulls(
        [
          { number: 10, mergedAt: null, headRef: 'feat/a' },
          { number: 11, headRef: 'main' },
          { number: 12, headRef: 'staging' },
        ],
        [],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(0);
    });

  it('excludes a PR named by a main PR promotion marker ' +
    '(renamed branch)', async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a', headSha: 'sha1',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/a-prod', headSha: 'other',
          mergedAt: '2026-01-02T00:00:00Z',
          body:
            'Same title\n\n---\n_Promoted from `staging` ' +
            '(PR #10) by the Promote-to-main workflow._\n',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(0);
    });

  it('ignores a marker on a closed-unmerged main PR', async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/a-prod', mergedAt: null,
          body: '_Promoted from `staging` (PR #10)._\n',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(1);
    });

  it('ignores the marker phrase mid-prose (line-anchored)',
    async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/b',
          mergedAt: '2026-01-02T00:00:00Z',
          body:
            'This was NOT promoted from `staging` ' +
            '(PR #10) — different branch.\n',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(1);
    });

  it('ignores a marker carried by a STAGING PR body', async () => {
      servePulls(
        [
          {
            number: 10, headRef: 'feat/a',
            mergedAt: '2026-01-01T00:00:00Z',
            body: '_Promoted from `staging` (PR #10)._\n',
          },
          {
            number: 30, headRef: 'feat/b',
            mergedAt: '2026-01-02T00:00:00Z',
          },
        ],
        [],
      );
      const prs = await fetchPendingStagingPrs();
      expect(prs.map((p) => p.number)).toEqual([10, 30]);
    });

  it('matches a bare marker line (no emphasis/backticks)',
    async () => {
      servePulls(
        [{
          number: 10, headRef: 'feat/a',
          mergedAt: '2026-01-01T00:00:00Z',
        }],
        [{
          number: 20, headRef: 'feat/a-prod',
          mergedAt: '2026-01-02T00:00:00Z',
          body: 'Notes.\nPromoted from staging (PR #10)\n',
        }],
      );
      expect(await fetchPendingStagingPrs()).toHaveLength(0);
    });

  it('keeps a staged PR whose number no marker names', async () => {
      servePulls(
        [
          {
            number: 10, headRef: 'feat/a',
            mergedAt: '2026-01-01T00:00:00Z',
          },
          {
            number: 30, headRef: 'feat/b',
            mergedAt: '2026-01-02T00:00:00Z',
          },
        ],
        [{
          number: 20, headRef: 'feat/a-prod',
          mergedAt: '2026-01-03T00:00:00Z',
          body: '_Promoted from `staging` (PR #10)._\n',
        }],
      );
      const prs = await fetchPendingStagingPrs();
      expect(prs.map((p) => p.number)).toEqual([30]);
    });

  it('orders pending PRs by staging merge time (oldest first)',
    async () => {
      servePulls(
        [
          {
            number: 11, headRef: 'feat/b',
            mergedAt: '2026-01-05T00:00:00Z',
          },
          {
            number: 10, headRef: 'feat/a',
            mergedAt: '2026-01-01T00:00:00Z',
          },
        ],
        [],
      );
      const prs = await fetchPendingStagingPrs();
      expect(prs.map((p) => p.number)).toEqual([10, 11]);
    });

  it('parses QC steps from the PR body', async () => {
    servePulls(
      [{
        number: 10,
        body: '## UI verification / QC\n1. Open menu\n- [ ] Tick it\n',
      }],
      [],
    );
    const prs = await fetchPendingStagingPrs();
    expect(prs[0].qcSteps).toEqual(['Open menu', 'Tick it']);
  });

  it('throws StagingPrsError with the status on a non-OK ' +
    'response', async () => {
      server.use(
        http.get(PULLS_URL, () =>
          HttpResponse.json({ message: 'rate limited' }, {
            status: 403,
          })),
      );
      await expect(fetchPendingStagingPrs()).rejects.toMatchObject({
        name: 'StagingPrsError',
        status: 403,
      });
    });

  it('throws StagingPrsError on a non-JSON 200 body', async () => {
    server.use(
      http.get(PULLS_URL, () =>
        new HttpResponse('<html>proxy page</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })),
    );
    await expect(fetchPendingStagingPrs()).rejects.toBeInstanceOf(
      StagingPrsError,
    );
  });

  it('throws StagingPrsError on a non-array payload', async () => {
    server.use(
      http.get(PULLS_URL, () => HttpResponse.json({ nope: 1 })),
    );
    await expect(fetchPendingStagingPrs()).rejects.toBeInstanceOf(
      StagingPrsError,
    );
  });

  it('skips mis-shaped PR entries', async () => {
    server.use(
      http.get(PULLS_URL, ({ request }) => {
        const base = new URL(request.url).searchParams.get('base');
        if (base !== 'staging') return HttpResponse.json([]);
        return HttpResponse.json([
          { number: 9, merged_at: '2026-01-01T00:00:00Z' },
          pr({ number: 10, title: 'Feat A', headRef: 'feat/a' }),
        ]);
      }),
    );
    const prs = await fetchPendingStagingPrs();
    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(10);
  });

  it('throws StagingPrsError on a network failure', async () => {
    server.use(
      http.get(PULLS_URL, () => HttpResponse.error()),
    );
    await expect(fetchPendingStagingPrs()).rejects.toBeInstanceOf(
      StagingPrsError,
    );
  });
});

describe('parseQcSteps', () => {
  it('parses numbered and bulleted steps up to the next heading',
    () => {
      const body =
        '## Summary\nDid things.\n\n## UI verification / QC\n' +
        '1. Open the menu\n2. Click the entry\n\n## Other\n- nope\n';
      expect(parseQcSteps(body)).toEqual([
        'Open the menu',
        'Click the entry',
      ]);
    });

  it('strips markdown task markers', () => {
    const body =
      '## UI verification / QC\n- [ ] Open the page\n' +
      '- [x] Already done\n- Plain bullet\n';
    expect(parseQcSteps(body)).toEqual([
      'Open the page',
      'Already done',
      'Plain bullet',
    ]);
  });

  it('reads a section at the end of the body', () => {
    const body =
      'text\n## UI verification / QC\n- Only step\n';
    expect(parseQcSteps(body)).toEqual(['Only step']);
  });

  it('returns null when the section is missing', () => {
    expect(parseQcSteps('## Summary\n1. not qc\n')).toBeNull();
    expect(parseQcSteps(null)).toBeNull();
    expect(parseQcSteps('')).toBeNull();
  });

  it('returns null when the section has no list items', () => {
    expect(
      parseQcSteps('## UI verification / QC\nJust prose.\n'),
    ).toBeNull();
  });

  it('handles CRLF line endings (GitHub API bodies)', () => {
    const body =
      '## UI verification / QC\r\n- [ ] Open it\r\n' +
      '1. Click it\r\n## Next\r\n- nope\r\n';
    expect(parseQcSteps(body)).toEqual(['Open it', 'Click it']);
  });

  it('drops bare task markers with no step text', () => {
    const body =
      '## UI verification / QC\n- [x]\n- Real step\n';
    expect(parseQcSteps(body)).toEqual(['Real step']);
  });
});
