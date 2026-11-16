/**
 * UI localization layer (i18next + react-i18next).
 *
 * `en` is bundled in the main chunk; `lv`/`ru` catalogs lazy-load
 * on demand via `changeUiLanguage` (one dynamic import per
 * locale, split into its own chunk by Vite). `en` is also the
 * source catalog — `i18next.d.ts` augments the resource types
 * from it, so `t()` rejects unknown keys at compile time and a
 * missing lv/ru key renders the English string via fallbackLng.
 *
 * Supported locales are BCP-47 codes; DBT `eng`/`lvs`/`rus`
 * appear only at the translation-default boundary
 * (`DEFAULT_TRANSLATION_BY_LOCALE`).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enBooks from './locales/en/books.json';

export const SUPPORTED_UI_LANGUAGES = ['en', 'lv', 'ru'] as const;
export type UiLanguage =
  (typeof SUPPORTED_UI_LANGUAGES)[number];

/** Autonyms shown in the language selector — never translated. */
export const UI_LANGUAGE_AUTONYMS: Record<UiLanguage, string> = {
  en: 'English',
  lv: 'Latviešu',
  ru: 'Русский',
};

/**
 * First-run default TEXT fileset per detected locale. Every
 * entry is a full-canon trusted translation verified against
 * live DBT at authoring time:
 * - en: ENGESV_API (the long-standing default)
 * - lv: LVSGLU8 (Glück, complete canon)
 * - ru: RUSSYN (1876 Synodal, text_plain size C, 66 books)
 * Unknown locales fall through to the `en` default.
 */
export const DEFAULT_TRANSLATION_BY_LOCALE: Record<
  UiLanguage,
  string
> = {
  en: 'ENGESV_API',
  lv: 'LVSGLU8',
  ru: 'RUSSYN',
};

export const isUiLanguage = (
  value: unknown
): value is UiLanguage =>
  typeof value === 'string' &&
  (SUPPORTED_UI_LANGUAGES as readonly string[]).includes(value);

/**
 * First-run detection: `navigator.language` prefix match
 * ('lv-LV' -> 'lv') -> 'en'. Never reads persisted state — see
 * `resolveUiLanguage` for the full precedence chain.
 */
export const detectUiLanguage = (
  navLanguage?: string
): UiLanguage => {
  const raw =
    navLanguage ??
    (typeof navigator !== 'undefined'
      ? navigator.language
      : '');
  const prefix = raw.split('-')[0]?.toLowerCase() ?? '';
  return isUiLanguage(prefix) ? prefix : 'en';
};

const STORAGE_KEY = 'bible-storage';

/**
 * The persisted `activeTextFilesetId` when one exists, else
 * the curated per-locale default. A stored selection is NEVER
 * overwritten — the locale map only applies on a genuine
 * first run (no persisted bible-storage at all, or a blob
 * that somehow lacks the field).
 */
export const resolveInitialTextFileset = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const persisted = (
          JSON.parse(raw) as {
            state?: { activeTextFilesetId?: unknown };
          }
        )?.state?.activeTextFilesetId;
        if (typeof persisted === 'string' && persisted) {
          return persisted;
        }
      }
    }
  } catch {
    // Corrupted storage — fall through to the locale default.
  }
  return DEFAULT_TRANSLATION_BY_LOCALE[resolveUiLanguage()];
};

/**
 * Full precedence: persisted `uiLanguage` choice ->
 * `navigator.language` prefix -> 'en'. Reads `bible-storage`
 * directly so i18n init stays free of store imports (the store
 * imports this module for `changeUiLanguage`; an edge back
 * would cycle through apiClient's `t()` calls).
 */
export const resolveUiLanguage = (): UiLanguage => {
  try {
    if (typeof localStorage === 'undefined') {
      return detectUiLanguage();
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: { uiLanguage?: unknown };
      };
      if (isUiLanguage(parsed?.state?.uiLanguage)) {
        return parsed.state.uiLanguage;
      }
    }
  } catch {
    // Corrupted storage — fall through to detection.
  }
  return detectUiLanguage();
};

type JsonModule = { default: Record<string, unknown> };

/** Dynamic-import loaders for the non-English catalogs. */
const catalogLoaders: Record<
  Exclude<UiLanguage, 'en'>,
  () => Promise<[JsonModule, JsonModule]>
> = {
  lv: () =>
    Promise.all([
      import('./locales/lv/common.json'),
      import('./locales/lv/books.json'),
    ]),
  ru: () =>
    Promise.all([
      import('./locales/ru/common.json'),
      import('./locales/ru/books.json'),
    ]),
};

const loadedLanguages = new Set<UiLanguage>(['en']);

let initPromise: Promise<unknown> | null = null;

/**
 * Initializes i18next with the bundled `en` catalog, then loads
 * the resolved UI language (persisted choice or detected
 * locale) before resolving — awaited ahead of the first render
 * so no untranslated flash paints.
 */
export const initI18n = (): Promise<unknown> => {
  initPromise ??= i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { common: enCommon, books: enBooks },
      },
      lng: 'en',
      fallbackLng: 'en',
      ns: ['common', 'books'],
      defaultNS: 'common',
      // Catalog JSONs merge per-locale — a partially bundled
      // language must not warn about missing resources.
      partialBundledLanguages: true,
      interpolation: {
        // React already escapes interpolations.
        escapeValue: false,
      },
      returnNull: false,
    })
    .then(async () => {
      const lang = resolveUiLanguage();
      if (lang === 'en') return;
      try {
        await changeUiLanguage(lang);
      } catch (error) {
        // The persisted choice's catalog failed to load and
        // i18next stays on 'en' — revert the stored
        // selection too, or the language selector would
        // keep showing `lang` over an English UI with no
        // explanation (the notification provider is not
        // mounted yet, so a toast here would be lost).
        // The store is imported dynamically: it already
        // depends on this module, so a static edge back
        // would create an import cycle.
        console.warn(
          `Failed to load the '${lang}' catalog — ` +
            'falling back to English.',
          error
        );
        const { useBibleStore } = await import('../store');
        if (useBibleStore.getState().uiLanguage === lang) {
          useBibleStore.setState({ uiLanguage: 'en' });
        }
      }
    });
  return initPromise;
};

/**
 * Switches the UI language, lazy-loading the locale's catalog
 * on first use. No-op for unknown codes — call sites validate
 * with `isUiLanguage` first.
 */
export const changeUiLanguage = async (
  lang: UiLanguage
): Promise<void> => {
  if (!loadedLanguages.has(lang) && lang !== 'en') {
    const [common, books] = await catalogLoaders[lang]();
    i18n.addResourceBundle(lang, 'common', common.default);
    i18n.addResourceBundle(lang, 'books', books.default);
    loadedLanguages.add(lang);
  }
  await i18n.changeLanguage(lang);
};

export default i18n;
