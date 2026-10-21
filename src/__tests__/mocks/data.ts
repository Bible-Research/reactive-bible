import { Translation, Fileset } from '../../store';

// Only `mockTranslations` has a live consumer (src/mocks/
// handlers.ts); every other fixture this file used to export
// had zero importers and was deleted in the JOB-8 dead-code
// sweep. Prefer the factories in `../helpers/factories` for
// per-test tag/verse/note fixtures.

// Matches the real API shape for the ENGKJV translation after
// `getAvailableTranslations` injects the bundled KJV entries:
// the API only lists the `_ET` splits (and DBT audio), the
// client adds the offline `ENGKJV` text/audio pseudo-filesets.
const mockFilesets: Fileset[] = [
  { id: 'ENGKJVO_ET', type: 'text_plain', size: 'OT',
    codec: null, bitrate: null },
  { id: 'ENGKJVN_ET', type: 'text_plain', size: 'NT',
    codec: null, bitrate: null },
  { id: 'ENGKJV', type: 'text_plain', size: 'C',
    codec: null, bitrate: null },
  { id: 'ENGKJV', type: 'audio', size: 'C',
    codec: null, bitrate: null },
  { id: 'ENGKJVO1DA', type: 'audio', size: 'OT',
    codec: 'mp3', bitrate: '64' },
  { id: 'ENGKJVN1DA', type: 'audio', size: 'NT',
    codec: 'mp3', bitrate: '64' },
];

export const mockTranslations: Translation[] = [
  {
    abbr: 'ENGKJV',
    name: 'King James Version',
    language: 'English',
    language_iso: 'eng',
    filesets: mockFilesets,
  },
  {
    abbr: 'ENGESV',
    name: 'English Standard Version',
    language: 'English',
    language_iso: 'eng',
    filesets: [
      { id: 'ENGESVO_ET', type: 'text_plain', size: 'OT',
        codec: null, bitrate: null },
      { id: 'ENGESVN_ET', type: 'text_plain', size: 'NT',
        codec: null, bitrate: null },
      { id: 'ENGESV_API', type: 'text_plain', size: 'C',
        codec: null, bitrate: null },
      { id: 'ENGESV_API', type: 'audio', size: 'C',
        codec: null, bitrate: null },
    ],
  },
  {
    abbr: 'ENGNIV',
    name: 'New International Version',
    language: 'English',
    language_iso: 'eng',
    filesets: [
      { id: 'ENGNIVO_ET', type: 'text_plain', size: 'OT',
        codec: null, bitrate: null },
      { id: 'ENGNIVN_ET', type: 'text_plain', size: 'NT',
        codec: null, bitrate: null },
    ],
  },
];
