/**
 * Per-locale YouTube ids for getting-started tutorial cards.
 * Narration is recorded per language (scripts at
 * `docs/video-scripts/getting-started.<locale>.md`), so the
 * embed id itself is locale data — `null`/absent means "not
 * yet recorded in that language".
 *
 * The catalogue (`src/data/gettingStartedVideos.ts`, added on
 * main by #247) resolves the embed id through
 * `resolveTutorialYoutubeId` and renders a card only when the
 * resolved id exists; `tutorials.<id>.title`/`.description`
 * catalog keys carry the card text.
 */
import type { UiLanguage } from '../i18n';

export type TutorialYoutubeIds = Partial<
  Record<UiLanguage, string | null>
>;

/**
 * The video a card should embed under `uiLanguage`: the
 * matching locale's recording when present, else the English
 * one, else null — the caller hides the card entirely when no
 * id resolves in any locale.
 */
export const resolveTutorialYoutubeId = (
  youtubeIds: TutorialYoutubeIds,
  uiLanguage: UiLanguage
): string | null =>
  youtubeIds[uiLanguage] ?? youtubeIds.en ?? null;
