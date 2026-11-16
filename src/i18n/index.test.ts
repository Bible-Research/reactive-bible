/**
 * i18n layer tests: catalog completeness across locales,
 * first-run detection/persistence precedence, plural-form
 * resolution for lv (zero) and ru (few/many), and the
 * localized API-error mapping.
 */
import { describe, expect, it } from 'vitest';
import i18n, {
  DEFAULT_TRANSLATION_BY_LOCALE,
  SUPPORTED_UI_LANGUAGES,
  UI_LANGUAGE_AUTONYMS,
  changeUiLanguage,
  detectUiLanguage,
  isUiLanguage,
  resolveInitialTextFileset,
  resolveUiLanguage,
} from './index';
import { localizedErrorText, textOrKey } from './errorText';
import {
  BookNotInFilesetError,
  ProviderError,
  RateLimitError,
} from '../api/errors';
import enCommon from './locales/en/common.json';
import enBooks from './locales/en/books.json';
import lvCommon from './locales/lv/common.json';
import lvBooks from './locales/lv/books.json';
import ruCommon from './locales/ru/common.json';
import ruBooks from './locales/ru/books.json';

const STORAGE_KEY = 'bible-storage';

type Json = Record<string, unknown>;

const flatten = (obj: Json, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value as Json, path)
      : [path];
  });

const PLURAL_FORMS = [
  '_zero',
  '_one',
  '_two',
  '_few',
  '_many',
  '_other',
] as const;

/** Strips the i18next plural suffix to compare stems. */
const pluralStem = (key: string): string => {
  const form = PLURAL_FORMS.find((suffix) =>
    key.endsWith(suffix)
  );
  return form ? key.slice(0, -form.length) : key;
};

/** Coverage check tolerant of extra plural forms in a locale. */
const coveredKeys = (en: Json, other: Json): string[] => {
  const otherKeys = new Set(flatten(other));
  return flatten(en).filter(
    (key) =>
      !otherKeys.has(key) &&
      ![...otherKeys].some(
        (otherKey) =>
          pluralStem(otherKey) === pluralStem(key) &&
          PLURAL_FORMS.some((form) => otherKey.endsWith(form))
      )
  );
};

const seedStorage = (state: Json): void => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state, version: 9 })
  );
};

describe('catalog completeness', () => {
  it.each([
    ['lv', lvCommon, lvBooks],
    ['ru', ruCommon, ruBooks],
  ])(
    '%s covers every English key in both namespaces',
    (_lang, common, books) => {
      expect(coveredKeys(enCommon, common as Json)).toEqual(
        []
      );
      expect(coveredKeys(enBooks, books as Json)).toEqual([]);
    }
  );

  it('has no empty or English-mirror leaf in lv/ru common', () => {
    const enFlat = new Map(
      flatten(enCommon).map((key) => {
        const parts = key.split('.');
        let node: unknown = enCommon;
        for (const part of parts) {
          node = (node as Json)[part];
        }
        return [key, node as string];
      })
    );
    for (const catalog of [lvCommon, ruCommon]) {
      for (const key of flatten(catalog as Json)) {
        const parts = key.split('.');
        let node: unknown = catalog;
        for (const part of parts) {
          node = (node as Json)[part];
        }
        const value = node as string;
        expect(value.length).toBeGreaterThan(0);
        // Untranslated placeholders would copy English
        // verbatim; brand/product names legitimately match.
        const brandNames = new Set([
          'app.name',
          'translations.audio',
          'translations.capabilityBoth',
          'share.biblemapperTitle',
        ]);
        if (!brandNames.has(key)) {
          expect(value).not.toBe(enFlat.get(key));
        }
      }
    }
  });
});

describe('language constants', () => {
  it('supports en, lv, ru with autonyms and defaults', () => {
    expect(SUPPORTED_UI_LANGUAGES).toEqual(['en', 'lv', 'ru']);
    expect(UI_LANGUAGE_AUTONYMS.lv).toBe('Latviešu');
    expect(UI_LANGUAGE_AUTONYMS.ru).toBe('Русский');
    for (const lang of SUPPORTED_UI_LANGUAGES) {
      expect(
        DEFAULT_TRANSLATION_BY_LOCALE[lang]
      ).toBeTruthy();
    }
    expect(DEFAULT_TRANSLATION_BY_LOCALE.lv).toBe('LVSGLU8');
    expect(DEFAULT_TRANSLATION_BY_LOCALE.ru).toBe('RUSSYN');
  });

  it('isUiLanguage rejects unknown codes', () => {
    expect(isUiLanguage('lv')).toBe(true);
    expect(isUiLanguage('de')).toBe(false);
    expect(isUiLanguage(42)).toBe(false);
    expect(isUiLanguage(undefined)).toBe(false);
  });
});

describe('detectUiLanguage', () => {
  it.each([
    ['lv-LV', 'lv'],
    ['lv', 'lv'],
    ['ru-RU', 'ru'],
    ['RU', 'ru'],
    ['de-DE', 'en'],
    ['en-US', 'en'],
    ['', 'en'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(detectUiLanguage(input)).toBe(expected);
  });
});

describe('resolveUiLanguage precedence', () => {
  it('prefers a persisted valid uiLanguage', () => {
    seedStorage({ uiLanguage: 'ru' });
    expect(resolveUiLanguage()).toBe('ru');
  });

  it('ignores an invalid persisted uiLanguage', () => {
    seedStorage({ uiLanguage: 'de' });
    expect(resolveUiLanguage()).toBe('en');
  });

  it('falls back to detection when nothing is stored', () => {
    localStorage.removeItem(STORAGE_KEY);
    expect(['en', 'lv', 'ru']).toContain(resolveUiLanguage());
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(STORAGE_KEY, '{{{not json');
    expect(resolveUiLanguage()).toBe('en');
  });
});

describe('resolveInitialTextFileset', () => {
  it('never overrides a persisted selection', () => {
    seedStorage({
      uiLanguage: 'ru',
      activeTextFilesetId: 'ENGKJV',
    });
    expect(resolveInitialTextFileset()).toBe('ENGKJV');
  });

  it('uses the locale default on a genuine first run', () => {
    seedStorage({ uiLanguage: 'lv' });
    expect(resolveInitialTextFileset()).toBe('LVSGLU8');
    seedStorage({ uiLanguage: 'ru' });
    expect(resolveInitialTextFileset()).toBe('RUSSYN');
    seedStorage({ uiLanguage: 'en' });
    expect(resolveInitialTextFileset()).toBe('ENGESV_API');
  });
});

describe('changeUiLanguage + plurals', () => {
  it('lazy-loads and translates lv', async () => {
    await changeUiLanguage('lv');
    expect(i18n.t('menu.readBible')).toBe('Lasīt Bībeli');
    expect(i18n.t('books:testament.ot')).toBe('Vecā Derība');
  });

  it('lazy-loads and translates ru', async () => {
    await changeUiLanguage('ru');
    expect(i18n.t('menu.readBible')).toBe('Читать Библию');
    expect(i18n.t('books:testament.nt')).toBe('Новый Завет');
  });

  it('resolves English plural forms', async () => {
    await changeUiLanguage('en');
    expect(
      i18n.t('search.resultCount', { count: 1 })
    ).toBe('1 result');
    expect(
      i18n.t('search.resultCount', { count: 5 })
    ).toBe('5 results');
  });

  it('resolves Latvian zero/one/other forms', async () => {
    await changeUiLanguage('lv');
    expect(
      i18n.t('search.resultCount', { count: 1 })
    ).toBe('1 rezultāts');
    expect(
      i18n.t('search.resultCount', { count: 5 })
    ).toBe('5 rezultāti');
    expect(
      i18n.t('search.resultCount', { count: 11 })
    ).toBe('11 rezultātu');
  });

  it('resolves Russian one/few/many forms', async () => {
    await changeUiLanguage('ru');
    expect(
      i18n.t('search.resultCount', { count: 1 })
    ).toBe('1 результат');
    expect(
      i18n.t('search.resultCount', { count: 3 })
    ).toBe('3 результата');
    expect(
      i18n.t('search.resultCount', { count: 5 })
    ).toBe('5 результатов');
    expect(
      i18n.t('search.resultCount', { count: 21 })
    ).toBe('21 результат');
  });

  it('switches back to English', async () => {
    await changeUiLanguage('en');
    expect(i18n.t('menu.readBible')).toBe('Read Bible');
  });
});

describe('localizedErrorText', () => {
  it('maps typed errors to their catalog keys', () => {
    expect(
      localizedErrorText(new RateLimitError('slow'))
    ).toBe(
      i18n.t('errors.rate_limited')
    );
    expect(
      localizedErrorText(new BookNotInFilesetError('GEN'))
    ).toBe(i18n.t('errors.book_not_in_fileset'));
    expect(localizedErrorText(new ProviderError('x'))).toBe(
      i18n.t('errors.provider_error')
    );
  });

  it('passes through uncoded Error messages', () => {
    expect(
      localizedErrorText(new Error('boom'))
    ).toBe('boom');
  });

  it('falls back to the generic text for non-errors', () => {
    expect(localizedErrorText('nope')).toBe(
      i18n.t('errors.generic')
    );
  });
});

describe('textOrKey', () => {
  it('translates catalog keys and passes raw text', () => {
    expect(textOrKey('auth.loginFailed')).toBe(
      i18n.t('auth.loginFailed')
    );
    expect(textOrKey('Server says hi')).toBe(
      'Server says hi'
    );
  });
});
