// src/utils/filesetGroups.ts
//
// Normalizes a translation's raw provider filesets
// ({id, type, size}) into "fileset options" — one logical
// product per (kind, version digit) — and resolves a stored
// selection (product id OR any member id) to the concrete
// fileset that serves a given book, with an ordered list of
// alternates for coverage gaps and codec failures.

import {
  getTestament,
  sizeToCoverage,
  type SizeCoverage,
  type Testament,
} from './bibleUtils';
import type { Fileset, Translation } from '../store';

export type OptionKind =
  'audio' | 'audio_drama' | 'generated' | 'text';

/** Codec slots used inside FilesetOption.byTestament. */
export type CodecKey =
  'mp3' | 'opus16' | 'generated' | 'api' | 'default';

export type CodecMap = Partial<Record<CodecKey, string>>;

export interface FilesetOption {
  /** Synthetic `${abbr}:${kind}:${n}` or backend-supplied id. */
  id: string;
  kind: OptionKind;
  /** testament → codec → concrete fileset id */
  byTestament: Partial<Record<Testament, CodecMap>>;
  /** Every concrete member fileset id of this option. */
  members: string[];
  coverageLabel: string;
  partial: { OT: boolean; NT: boolean };
}

export interface GroupedFilesets {
  /** At most one merged text option per translation. */
  text: FilesetOption | null;
  audio: FilesetOption[];
}

export interface ResolvedAudio {
  filesetId: string;
  codec: CodecKey;
  /** Ordered concrete ids to try if filesetId fails. */
  alternates: string[];
}

const OPUS16_SUFFIX = '-opus16';

/** DBT audio id suffix: `{bibleId}{sizeLetter}{digit}DA`. */
const AUDIO_ID_PATTERN = /([CONPS])(\d)DA$/;

/** SWORD TTS audio ids carry generated speech, not studio audio. */
const GENERATED_ID_PREFIX = 'LVSGLU8';

/** ESV audio is proxied through api.esv.org, not DBT filesets. */
const ESV_API_ID = 'ENGESV_API';

/**
 * Codec preference for playback: opus16 webm first (smaller
 * payloads), mp3 as the universal fallback, then the
 * single-variant codecs.
 */
const CODEC_PREFERENCE: CodecKey[] = [
  'opus16',
  'mp3',
  'api',
  'generated',
  'default',
];

const splitCodec = (id: string): { baseId: string; codec: CodecKey } =>
  id.endsWith(OPUS16_SUFFIX)
    ? {
        baseId: id.slice(0, -OPUS16_SUFFIX.length),
        codec: 'opus16',
      }
    : { baseId: id, codec: 'mp3' };

/** A concrete fileset considered while merging an option. */
interface MemberCandidate {
  /** Concrete fileset id as it appears in `filesets`. */
  id: string;
  codec: CodecKey;
  coverage: SizeCoverage;
  /** True when the id's size letter is 'P' (partial marker). */
  partialId: boolean;
}

/** True when a member covers both testaments completely. */
const isComplete = (member: MemberCandidate): boolean =>
  member.coverage.testaments.length === 2 &&
  !member.coverage.partial.OT &&
  !member.coverage.partial.NT;

/**
 * Claims a testament+codec slot. Precedence: complete coverage
 * over partial, then a complete both-testament member over a
 * testament-specific one (prefers `ENGKJV`/`ENGESV_API` over
 * `_ET` splits), then non-'P' lettered ids over 'P' ids.
 */
const claimSlot = (
  slots: Map<string, MemberCandidate>,
  member: MemberCandidate,
  testament: Testament,
): void => {
  const key = `${testament}:${member.codec}`;
  const current = slots.get(key);
  if (!current) {
    slots.set(key, member);
    return;
  }
  const currentPartial = current.coverage.partial[testament];
  const memberPartial = member.coverage.partial[testament];
  if (currentPartial !== memberPartial) {
    if (currentPartial) slots.set(key, member);
    return;
  }
  const currentComplete = isComplete(current);
  if (currentComplete !== isComplete(member)) {
    if (!currentComplete) slots.set(key, member);
    return;
  }
  if (current.partialId !== member.partialId && current.partialId) {
    slots.set(key, member);
  }
};

const slotsToByTestament = (
  slots: Map<string, MemberCandidate>,
): Partial<Record<Testament, CodecMap>> => {
  const byTestament: Partial<Record<Testament, CodecMap>> = {};
  for (const [key, member] of slots) {
    const testament = key.split(':')[0] as Testament;
    (byTestament[testament] ??= {})[member.codec] = member.id;
  }
  return byTestament;
};

const optionPartial = (
  members: MemberCandidate[],
): { OT: boolean; NT: boolean } => {
  const result = { OT: false, NT: false };
  for (const t of ['OT', 'NT'] as Testament[]) {
    const covering = members.filter((m) =>
      m.coverage.testaments.includes(t),
    );
    result[t] =
      covering.length > 0 &&
      covering.every((m) => m.coverage.partial[t]);
  }
  return result;
};

const coverageLabel = (
  byTestament: Partial<Record<Testament, CodecMap>>,
  partial: { OT: boolean; NT: boolean },
): string => {
  const hasOT = Boolean(byTestament.OT);
  const hasNT = Boolean(byTestament.NT);
  let base = 'Unknown coverage';
  if (hasOT && hasNT) base = 'Full Bible';
  else if (hasNT) base = 'New Testament only';
  else if (hasOT) base = 'Old Testament only';
  return partial.OT || partial.NT ? `${base} (partial)` : base;
};

const buildOption = (
  id: string,
  kind: OptionKind,
  members: MemberCandidate[],
): FilesetOption => {
  const slots = new Map<string, MemberCandidate>();
  for (const member of members) {
    for (const t of member.coverage.testaments) {
      claimSlot(slots, member, t);
    }
  }
  const byTestament = slotsToByTestament(slots);
  const partial = optionPartial(members);
  return {
    id,
    kind,
    byTestament,
    members: members.map((m) => m.id),
    coverageLabel: coverageLabel(byTestament, partial),
    partial,
  };
};

const audioKind = (
  fileset: Fileset,
  digit: string | null,
): OptionKind => {
  if (fileset.id.startsWith(GENERATED_ID_PREFIX)) {
    return 'generated';
  }
  if (digit === '2' || fileset.type === 'audio_drama') {
    return 'audio_drama';
  }
  return 'audio';
};

const KIND_ORDER: OptionKind[] = [
  'audio',
  'audio_drama',
  'generated',
  'text',
];

const groupAudioFilesets = (
  filesets: Fileset[],
  abbr: string,
): FilesetOption[] => {
  const groups = new Map<string, MemberCandidate[]>();
  const kinds = new Map<string, OptionKind>();

  for (const f of filesets) {
    if (!f.type.startsWith('audio')) continue;

    // Single-variant sources never pair by suffix: the SWORD TTS
    // id is generated speech, ENGESV_API is an api.esv.org proxy.
    if (f.id.startsWith(GENERATED_ID_PREFIX)) {
      const key = `generated:${f.id}`;
      groups.set(key, [
        {
          id: f.id,
          codec: 'generated',
          coverage: sizeToCoverage(f.size),
          partialId: false,
        },
      ]);
      kinds.set(key, 'generated');
      continue;
    }
    if (f.id === ESV_API_ID) {
      const key = `api:${f.id}`;
      groups.set(key, [
        {
          id: f.id,
          codec: 'api',
          coverage: sizeToCoverage(f.size),
          partialId: false,
        },
      ]);
      kinds.set(key, 'audio');
      continue;
    }

    const { baseId, codec } = splitCodec(f.id);
    const match = baseId.match(AUDIO_ID_PATTERN);
    if (!match) {
      // Non-DBT-shaped audio id (e.g. the injected 'ENGKJV'
      // wordpocket entry) — its own single-variant option.
      const key = `other:${f.id}`;
      groups.set(key, [
        {
          id: f.id,
          codec,
          coverage: sizeToCoverage(f.size),
          partialId: false,
        },
      ]);
      kinds.set(key, audioKind(f, null));
      continue;
    }

    // Group key: (type, version digit) — the size letter only
    // marks partial-member preference, coverage comes from size.
    const key = `${f.type}:${match[2]}`;
    const member: MemberCandidate = {
      id: f.id,
      codec,
      coverage: sizeToCoverage(f.size),
      partialId: match[1] === 'P',
    };
    groups.set(key, [...(groups.get(key) ?? []), member]);
    kinds.set(key, audioKind(f, match[2]));
  }

  const counters = new Map<OptionKind, number>();
  return [...groups.entries()]
    .map(([key, members]) =>
      buildOption(
        `${abbr}:${kinds.get(key)}`,
        kinds.get(key) ?? 'audio',
        members,
      ),
    )
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    )
    .map((option) => {
      const n = counters.get(option.kind) ?? 0;
      counters.set(option.kind, n + 1);
      return { ...option, id: `${option.id}:${n}` };
    });
};

const groupTextFilesets = (
  filesets: Fileset[],
  abbr: string,
): FilesetOption | null => {
  const members: MemberCandidate[] = filesets
    .filter((f) => f.type === 'text_plain')
    .map((f) => ({
      id: f.id,
      codec: 'default' as CodecKey,
      coverage: sizeToCoverage(f.size),
      // `_ET` splits use no 'P' letter; keep the flag anyway so
      // partial ids lose to complete ones.
      partialId: /P\dDA$/.test(f.id),
    }));
  if (members.length === 0) return null;
  return buildOption(`${abbr}:text:0`, 'text', members);
};

/** Backend `audio_options`/`text_options` entry (snake_case). */
interface BackendOptionShape {
  id?: unknown;
  kind?: unknown;
  coverage?: unknown;
  coverage_label?: unknown;
  partial?: unknown;
  by_testament?: unknown;
  members?: unknown;
}

const normalizeBackendOption = (
  raw: unknown,
  fallbackKind: OptionKind,
  index: number,
  abbr: string,
): FilesetOption | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as BackendOptionShape;
  const byTestament: Partial<Record<Testament, CodecMap>> = {};
  const members: string[] = [];
  const pushMember = (id: string) => {
    if (!members.includes(id)) members.push(id);
  };

  if (typeof o.by_testament === 'object' && o.by_testament) {
    const bt = o.by_testament as Record<string, unknown>;
    for (const t of ['OT', 'NT'] as Testament[]) {
      const value = bt[t];
      if (typeof value === 'string') {
        byTestament[t] = { default: value };
        pushMember(value);
      } else if (typeof value === 'object' && value) {
        const map: CodecMap = {};
        for (const [codec, id] of Object.entries(value)) {
          if (typeof id === 'string') {
            map[codec as CodecKey] = id;
            pushMember(id);
          }
        }
        if (Object.keys(map).length > 0) byTestament[t] = map;
      }
    }
  }
  if (Array.isArray(o.members)) {
    for (const m of o.members) {
      if (typeof m === 'string') pushMember(m);
    }
  }
  if (members.length === 0) return null;

  const partial =
    typeof o.partial === 'object' && o.partial
      ? {
          OT: Boolean((o.partial as { OT?: unknown }).OT),
          NT: Boolean((o.partial as { NT?: unknown }).NT),
        }
      : { OT: false, NT: false };
  const coverageField =
    typeof o.coverage === 'string'
      ? o.coverage
      : typeof o.coverage_label === 'string'
        ? o.coverage_label
        : null;
  if (coverageField?.includes('partial')) {
    if (byTestament.OT) partial.OT = true;
    if (byTestament.NT) partial.NT = true;
  }

  const kind: OptionKind =
    typeof o.kind === 'string'
      ? (o.kind as OptionKind)
      : fallbackKind;
  return {
    id:
      typeof o.id === 'string'
        ? o.id
        : `${abbr}:${kind}:${index}`,
    kind,
    byTestament,
    members,
    coverageLabel: coverageField ?? coverageLabel(byTestament, partial),
    partial,
  };
};

const normalizeBackendOptions = (
  raw: unknown[],
  fallbackKind: OptionKind,
  abbr: string,
): FilesetOption[] =>
  raw
    .map((o, i) => normalizeBackendOption(o, fallbackKind, i, abbr))
    .filter((o): o is FilesetOption => o !== null);

const groupCache = new WeakMap<Translation, GroupedFilesets>();

/**
 * Groups a translation's filesets into normalized options.
 * Consumes backend-provided `audio_options`/`text_options` when
 * present; otherwise applies the client-side grouping algorithm
 * to the raw `filesets` list. Results are memoized per
 * Translation object.
 */
export const groupFilesets = (
  translation: Translation,
): GroupedFilesets => {
  const cached = groupCache.get(translation);
  if (cached) return cached;

  const filesets = translation.filesets ?? [];
  const audio = Array.isArray(translation.audio_options)
    ? normalizeBackendOptions(
        translation.audio_options,
        'audio',
        translation.abbr,
      )
    : groupAudioFilesets(filesets, translation.abbr);
  const text = Array.isArray(translation.text_options)
    ? (normalizeBackendOptions(
        translation.text_options,
        'text',
        translation.abbr,
      )[0] ?? null)
    : groupTextFilesets(filesets, translation.abbr);

  const grouped = { text, audio };
  groupCache.set(translation, grouped);
  return grouped;
};

const pickCodec = (
  map: CodecMap | undefined,
): { id: string; codec: CodecKey } | null => {
  if (!map) return null;
  for (const codec of CODEC_PREFERENCE) {
    const id = map[codec];
    if (id) return { id, codec };
  }
  const first = Object.values(map).find(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return first ? { id: first, codec: 'default' } : null;
};

/** Product ids are minted as `{abbr}:{kind}:{n}`. */
const PRODUCT_ID_PATTERN =
  /^(.*):(audio|audio_drama|generated|text):(\d+)$/;

const parseProductId = (
  id: string,
): { abbr: string; kind: OptionKind; index: number } | null => {
  const match = id.match(PRODUCT_ID_PATTERN);
  if (!match) return null;
  return {
    abbr: match[1],
    kind: match[2] as OptionKind,
    index: Number(match[3]),
  };
};

const textOptions = (t: Translation): FilesetOption[] => {
  const { text } = groupFilesets(t);
  return text ? [text] : [];
};

/**
 * Fallback matcher for drifted product ids: selections persisted
 * before the backend `audio_options`/`text_options` rollout were
 * minted client-side with 0-based per-kind indexes while the
 * backend mints 1-based ids, so a stored `{abbr}:{kind}:{n}` id
 * can match neither `option.id` nor `members` after the rollout.
 * Treat it as "the nth option of that kind owned by the
 * translation" (index clamped to the available candidates).
 */
const findOptionByProductPrefix = (
  storedId: string,
  optionsOf: (t: Translation) => FilesetOption[],
  translations: Translation[],
): { translation: Translation; option: FilesetOption } | null => {
  const parsed = parseProductId(storedId);
  if (!parsed) return null;
  for (const translation of translations) {
    if (translation.abbr !== parsed.abbr) continue;
    const candidates = optionsOf(translation).filter(
      (o) => o.kind === parsed.kind,
    );
    if (candidates.length === 0) continue;
    return {
      translation,
      option: candidates[parsed.index] ?? candidates[0],
    };
  }
  return null;
};

const findTextOption = (
  storedId: string,
  translations: Translation[],
): { translation: Translation; option: FilesetOption } | null => {
  for (const translation of translations) {
    for (const option of textOptions(translation)) {
      if (
        option.id === storedId ||
        option.members.includes(storedId)
      ) {
        return { translation, option };
      }
    }
  }
  return findOptionByProductPrefix(
    storedId,
    textOptions,
    translations,
  );
};

/**
 * Finds the audio option owning a stored selection — a product
 * id, any member id, or a drifted `{abbr}:{kind}:{n}` product id
 * (client 0-based vs backend 1-based index drift).
 */
export const findAudioOption = (
  storedId: string | null,
  translations: Translation[],
): { translation: Translation; option: FilesetOption } | null => {
  if (!storedId) return null;
  for (const translation of translations) {
    for (const option of groupFilesets(translation).audio) {
      if (
        option.id === storedId ||
        option.members.includes(storedId)
      ) {
        return { translation, option };
      }
    }
  }
  return findOptionByProductPrefix(
    storedId,
    (t) => groupFilesets(t).audio,
    translations,
  );
};

/**
 * Finds the translation that owns a fileset id — whether stored
 * as a raw member id or a grouped product id.
 */
export const findTranslationByFilesetId = (
  storedId: string | null,
  translations: Translation[],
): Translation | null => {
  if (!storedId) return null;
  for (const t of translations) {
    if (t.filesets.some((f) => f.id === storedId)) return t;
    const { text, audio } = groupFilesets(t);
    if (text?.id === storedId) return t;
    if (audio.some((o) => o.id === storedId)) return t;
  }
  // Drifted product id (see findOptionByProductPrefix): resolve
  // by `{abbr}:{kind}` prefix so pre-rollout selections still
  // find their owning translation.
  return (
    findOptionByProductPrefix(
      storedId,
      (t) => [...textOptions(t), ...groupFilesets(t).audio],
      translations,
    )?.translation ?? null
  );
};

/**
 * Resolves a stored audio selection (product id or any member
 * id, including legacy persisted ids) to the concrete fileset
 * that serves `bookId`, preferring the opus16 codec.
 *
 * `alternates` is ordered by desirability: the mp3 codec sibling
 * first (codec fallback is the cheapest retry), then the
 * other-testament member of the same product, then other options
 * of the same kind, then any remaining audio option.
 */
export const resolveAudioFileset = (
  storedId: string | null,
  bookId: string,
  translations: Translation[],
): ResolvedAudio | null => {
  if (!storedId) return null;

  // The bundled KJV translation streams audio from
  // wordpocket.org — pass the id through untouched so the
  // `filesetId === 'ENGKJV'` fast paths keep working. Product
  // ids (`ENGKJV:audio:0`) collapse to the bare id as well —
  // they must not depend on the translations list being loaded.
  if (storedId === 'ENGKJV' || storedId.startsWith('ENGKJV:')) {
    return { filesetId: 'ENGKJV', codec: 'mp3', alternates: [] };
  }

  const found = findAudioOption(storedId, translations);
  if (!found) {
    // Unknown or stale persisted id — pass it through so legacy
    // selections keep working exactly as before.
    return {
      filesetId: storedId,
      codec: splitCodec(storedId).codec,
      alternates: [],
    };
  }

  const { translation, option } = found;
  const testament = getTestament(bookId);
  const other: Testament = testament === 'OT' ? 'NT' : 'OT';

  const primary =
    pickCodec(testament ? option.byTestament[testament] : undefined) ??
    pickCodec(testament ? option.byTestament[other] : undefined) ??
    pickCodec(option.byTestament.NT) ??
    pickCodec(option.byTestament.OT);

  if (!primary) {
    return { filesetId: storedId, codec: 'mp3', alternates: [] };
  }

  const alternates: string[] = [];
  const push = (id: string | undefined) => {
    if (id && id !== primary.id && !alternates.includes(id)) {
      alternates.push(id);
    }
  };

  // Codec siblings for both testaments of the same product —
  // the requested testament's mp3 sibling lands first.
  if (testament) {
    for (const codec of CODEC_PREFERENCE) {
      push(option.byTestament[testament]?.[codec]);
    }
    for (const codec of CODEC_PREFERENCE) {
      push(option.byTestament[other]?.[codec]);
    }
  }

  // Other audio options in the translation: same kind first,
  // then any kind that can still produce audio.
  const options = groupFilesets(translation).audio;
  const rest = [
    ...options.filter((o) => o.kind === option.kind),
    ...options.filter((o) => o.kind !== option.kind),
  ];
  for (const o of rest) {
    if (o.id === option.id) continue;
    const pick =
      pickCodec(testament ? o.byTestament[testament] : undefined) ??
      pickCodec(testament ? o.byTestament[other] : undefined) ??
      pickCodec(o.byTestament.NT) ??
      pickCodec(o.byTestament.OT);
    push(pick?.id);
  }

  return {
    filesetId: primary.id,
    codec: primary.codec,
    alternates,
  };
};

/**
 * Resolves a stored text selection to the concrete `text_plain`
 * fileset covering `bookId`'s testament — transparently hopping
 * `_ET` testament splits. Unknown/persisted ids pass through so
 * stale selections degrade to the existing error UI rather than
 * a blank reader.
 */
export const resolveTextFileset = (
  storedId: string | null,
  bookId: string,
  translations: Translation[],
): string | null => {
  if (!storedId) return null;
  // Product ids minted for the bundled KJV (`ENGKJV:text:0`)
  // resolve to the offline bundle even before the translations
  // list is loaded — the `filesetId === 'ENGKJV'` fast paths in
  // api.tsx must keep working.
  if (storedId === 'ENGKJV' || storedId.startsWith('ENGKJV:')) {
    return 'ENGKJV';
  }

  const found = findTextOption(storedId, translations);
  if (!found) return storedId;

  const text = found.option;
  const testament = getTestament(bookId);
  const other: Testament = testament === 'OT' ? 'NT' : 'OT';
  const pick = (t: Testament | null): string | undefined => {
    if (!t) return undefined;
    const map = text.byTestament[t];
    return map?.default ?? Object.values(map ?? {})[0];
  };
  return (
    pick(testament) ?? pick(other) ?? text.members[0] ?? storedId
  );
};
