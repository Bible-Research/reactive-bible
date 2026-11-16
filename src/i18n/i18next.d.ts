/**
 * Type augmentation: the `en` catalog is the resource source of
 * truth — `t()` rejects keys missing from it, so extraction
 * adds keys to `en` first and a typo fails `tsc`.
 */
import 'i18next';
import type common from './locales/en/common.json';
import type books from './locales/en/books.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      books: typeof books;
    };
  }
}
