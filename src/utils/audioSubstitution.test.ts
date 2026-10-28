import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showNotification } from '@mantine/notifications';
import {
  isCrossTranslationPlayback,
  notifyAudioSubstitution,
} from './audioSubstitution';
import type { Fileset, Translation } from '../store';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const fs = (
  id: string,
  type: Fileset['type'],
  size: string,
): Fileset => ({ id, type, size, codec: null, bitrate: null });

const tr = (
  abbr: string,
  filesets: Fileset[],
  extra: Partial<Translation> = {},
): Translation => ({
  abbr,
  name: abbr,
  language: 'Test',
  language_iso: 'eng',
  filesets,
  ...extra,
});

// The selected Latvian audio product and the generated GLU8
// fallback — mirrors the reported Jeremiah coverage gap.
const LAVLVR = tr('LAVLVR', [
  fs('LATLVRN1DA', 'audio', 'NT'),
], { name: '1953 BFBS', language: 'Latvian', language_iso: 'lvs' });
const GLU8 = tr('GLU8', [
  fs('LVSGLU8', 'text_plain', 'C'),
  fs('LVSGLU8C1DA', 'audio', 'C'),
], { name: 'Glück 8', language: 'Latvian', language_iso: 'lvs' });

const translations = [LAVLVR, GLU8];

describe('isCrossTranslationPlayback', () => {
  it('detects a foreign-owner playback', () => {
    expect(
      isCrossTranslationPlayback(
        'LAVLVR:audio:1',
        'LVSGLU8C1DA',
        translations,
      ),
    ).toBe(true);
  });

  it('treats same-owner and unresolvable ids as same-owner', () => {
    expect(
      isCrossTranslationPlayback(
        'LAVLVR:audio:1',
        'LATLVRN1DA',
        translations,
      ),
    ).toBe(false);
    // Unknown passthrough ids resolve to no owner — conservative
    // false so codec memory is still recorded.
    expect(
      isCrossTranslationPlayback(
        'FOO1DA',
        'FOO1DA',
        translations,
      ),
    ).toBe(false);
  });
});

describe('notifyAudioSubstitution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('announces a foreign-owner playback once per pair+book',
    () => {
      const notified = new Set<string>();
      notifyAudioSubstitution(
        'LAVLVR:audio:1',
        'LVSGLU8C1DA',
        'JER',
        translations,
        notified,
      );
      notifyAudioSubstitution(
        'LAVLVR:audio:1',
        'LVSGLU8C1DA',
        'JER',
        translations,
        notified,
      );
      expect(showNotification).toHaveBeenCalledTimes(1);
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Audio not in selected version',
          message: expect.stringContaining('Glück 8'),
        }),
      );
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('1953 BFBS'),
        }),
      );
    },
  );

  it('re-announces the same pair for a different book', () => {
    const notified = new Set<string>();
    notifyAudioSubstitution(
      'LAVLVR:audio:1',
      'LVSGLU8C1DA',
      'JER',
      translations,
      notified,
    );
    notifyAudioSubstitution(
      'LAVLVR:audio:1',
      'LVSGLU8C1DA',
      'EZK',
      translations,
      notified,
    );
    expect(showNotification).toHaveBeenCalledTimes(2);
  });

  it('stays silent for same-owner and unresolvable playback',
    () => {
      const notified = new Set<string>();
      notifyAudioSubstitution(
        'LAVLVR:audio:1',
        'LATLVRN1DA',
        'JHN',
        translations,
        notified,
      );
      notifyAudioSubstitution(
        null,
        'LVSGLU8C1DA',
        'JER',
        translations,
        notified,
      );
      notifyAudioSubstitution(
        'FOO1DA',
        'FOO1DA',
        'JHN',
        translations,
        notified,
      );
      expect(showNotification).not.toHaveBeenCalled();
    },
  );
});
