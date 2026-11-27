/**
 * "What's on staging" data layer for the preview-only release
 * checklist: the set of PRs merged into `staging` but not yet
 * promoted to `main`, read live from the public GitHub REST API.
 *
 * The pending-set algorithm mirrors promote-to-main.yml: the
 * latest merged `base=staging` PR per head branch, minus
 * branches whose head SHA already has a merged `base=main` PR
 * (clean squash) or whose latest main merge is newer than the
 * staging merge (replayed promotion — it lands under a new SHA
 * on the same branch). Deliberately NOT the
 * `compare/main...staging` shortcut: after a partially failed
 * train, promoted squash commits remain on staging until the
 * reset and would show as false pending.
 *
 * api.github.com sends `Access-Control-Allow-Origin: *`, so a
 * plain unauthenticated fetch works from the browser (same
 * precedent as fetchNewestApkUrl). 60 req/hr per IP — ~2 calls
 * per modal open, fine for a QA tool; failures surface as
 * StagingPrsError so the modal can offer the compare-view
 * fallback. Pulls-list pagination caps at the 100 most recently
 * UPDATED closed PRs per base (unmerged ones consume slots
 * too) — more than ~100 closed-PR touches since the last
 * release is implausible here (the workflow errors at 200
 * MERGED ones), so a dropped older entry is acceptable.
 */

const REPO = 'Bible-Research/reactive-bible';
const PULLS_API = `https://api.github.com/repos/${REPO}/pulls`;

/** Manual equivalent the modal links to when the API fails. */
export const STAGING_COMPARE_URL =
  `https://github.com/${REPO}/compare/main...staging`;

export interface StagingPr {
  number: number;
  title: string;
  htmlUrl: string;
  /** Steps parsed from the PR body's QC section; null when the
   *  PR body has no such section (UI links to the PR instead). */
  qcSteps: string[] | null;
}

/** Any fetch failure — non-OK response, malformed payload, or
 *  network throw. `status` carries the HTTP code when known. */
export class StagingPrsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StagingPrsError';
  }
}

// Only the fields the pending-set algorithm and the UI need.
interface GithubPr {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  head: { ref: string; sha: string };
}

const fetchMergedPulls = async (
  base: 'staging' | 'main',
): Promise<GithubPr[]> => {
  const url =
    `${PULLS_API}?state=closed&base=${base}` +
    '&per_page=100&sort=updated&direction=desc';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new StagingPrsError('Network request failed');
  }
  if (!res.ok) {
    throw new StagingPrsError(
      `GitHub API responded ${res.status}`,
      res.status,
    );
  }
  // A 200 body can still be non-JSON (proxy error page) or
  // mis-shaped — both are StagingPrsError, never a raw
  // SyntaxError/TypeError leaking past the typed contract.
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new StagingPrsError('GitHub API returned non-JSON');
  }
  if (!Array.isArray(data)) {
    throw new StagingPrsError('Unexpected GitHub API payload');
  }
  const isPr = (v: unknown): v is GithubPr =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as GithubPr).number === 'number' &&
    typeof (v as GithubPr).title === 'string' &&
    typeof (v as GithubPr).html_url === 'string' &&
    typeof (v as GithubPr).head === 'object' &&
    (v as GithubPr).head !== null &&
    typeof (v as GithubPr).head.ref === 'string' &&
    typeof (v as GithubPr).head.sha === 'string';
  // `main`/`staging` heads are sync PRs, never feature work —
  // the workflow excludes them for the same reason.
  return data.filter(
    (pr): pr is GithubPr =>
      isPr(pr) &&
      typeof pr.merged_at === 'string' &&
      pr.head.ref !== 'main' &&
      pr.head.ref !== 'staging',
  );
};

// Latest merged PR per head branch — a branch can be merged
// repeatedly (re-fixes), only its newest staging merge counts.
const latestByBranch = (prs: GithubPr[]): Map<string, GithubPr> => {
  const latest = new Map<string, GithubPr>();
  for (const pr of prs) {
    const cur = latest.get(pr.head.ref);
    if (
      !cur ||
      Date.parse(pr.merged_at ?? '') >
        Date.parse(cur.merged_at ?? '')
    ) {
      latest.set(pr.head.ref, pr);
    }
  }
  return latest;
};

export const fetchPendingStagingPrs = async (): Promise<
  StagingPr[]
> => {
  const [staged, main] = await Promise.all([
    fetchMergedPulls('staging'),
    fetchMergedPulls('main'),
  ]);
  const mainByBranch = latestByBranch(main);
  return [...latestByBranch(staged).values()]
    .filter((spr) => {
      const m = mainByBranch.get(spr.head.ref);
      if (!m) return true;
      const stagedAt = Date.parse(spr.merged_at ?? '');
      const mainAt = Date.parse(m.merged_at ?? '');
      return m.head.sha !== spr.head.sha && mainAt < stagedAt;
    })
    .sort(
      (a, b) =>
        Date.parse(a.merged_at ?? '') -
        Date.parse(b.merged_at ?? ''),
    )
    .map((spr) => ({
      number: spr.number,
      title: spr.title,
      htmlUrl: spr.html_url,
      qcSteps: parseQcSteps(spr.body),
    }));
};

const QC_HEADING = /^##\s+UI verification\s*\/\s*QC\s*$/im;
const NEXT_HEADING = /^##\s/m;
const STEP_LINE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/;

/**
 * Extract the checkable steps from a PR body's
 * `## UI verification / QC` section: ordered/unordered list
 * lines (including `- [ ]` markdown tasks) between that heading
 * and the next `## ` heading. PR bodies hard-wrap at ~79
 * chars, so a non-bullet line under a step is folded into that
 * step (matching how GitHub renders the wrapped item); a blank
 * or heading line ends it. Returns null when the section is
 * absent — callers then link to the PR instead of rendering an
 * empty checklist.
 */
export const parseQcSteps = (
  body: string | null | undefined,
): string[] | null => {
  if (!body) return null;
  const heading = QC_HEADING.exec(body);
  if (!heading) return null;
  const rest = body.slice(heading.index + heading[0].length);
  const end = NEXT_HEADING.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const steps: string[] = [];
  // Whether the latest step can still absorb continuation
  // lines — a blank or heading line ends it.
  let open = false;
  for (const line of section.split('\n')) {
    const text = STEP_LINE.exec(line)?.[1];
    if (text !== undefined) {
      // A bare `- [x]` (marker, no text) is not a step — the
      // marker group needs `\s+` after it, so the brackets
      // would otherwise be captured as the label.
      open = !/^\[[ xX]\]$/.test(text);
      if (open) steps.push(text);
    } else if (
      !line.trim() ||
      // Blank, heading and block-starter lines end the step —
      // folding fences/quotes/rules/tables into the label
      // would pollute it (CommonMark ends the item there).
      /^\s*(?:#|>|`{3}|~{3}|\||<|(?:[-*_]\s*){3,})/.test(line)
    ) {
      open = false;
    } else if (open) {
      steps[steps.length - 1] += ` ${line.trim()}`;
    }
  }
  return steps.length > 0 ? steps : null;
};
