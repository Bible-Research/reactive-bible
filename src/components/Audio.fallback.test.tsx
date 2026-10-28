import {
  act,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import Audio from './Audio';
import { renderWithProviders } from '../__tests__/helpers';
import { getBibleAudioUrl, BookNotInFilesetError } from '../api';
import { showNotification } from '@mantine/notifications';
import {
  stubMediaSession,
  type MediaSessionStub,
} from '../__tests__/mocks/mediaSession';
import type { BibleState, Translation } from '../store';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

// Mock API — importOriginal keeps BookNotInFilesetError's real
// class so the coverage-miss instanceof checks behave like
// production.
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>(
    '../api',
  );
  return {
    ...actual,
    getKjvAudioUrl:
      vi.fn().mockReturnValue('http://audio.url/test.mp3'),
    getBibleAudioUrl: vi.fn(),
    getAudioTimestamps: vi.fn().mockResolvedValue([]),
    // No adjacent chapters: no next-chapter preload, so each
    // test sees exactly the Howls it causes.
    getAdjacentChapters: vi.fn().mockReturnValue({
      previous: null,
      next: null,
    }),
  };
});

// The reported Latvian setup (Sentry feedback, GLU8 text +
// LAVLVR audio on Jeremiah 1): the LAVLVR OT recording is
// partial and does not cover Jeremiah, while the Glück
// generated audio does.
const LAVLVR: Translation = {
  abbr: 'LAVLVR',
  name: '1953 British and Foreign Bible Society',
  language: 'Latvian',
  language_iso: 'lvs',
  filesets: [
    { id: 'LATLVRP1DA', type: 'audio', size: 'OTP',
      codec: 'mp3', bitrate: '64' },
    { id: 'LATLVRP1DA-opus16', type: 'audio', size: 'OTP',
      codec: 'opus', bitrate: '16' },
    { id: 'LATLVRN1DA', type: 'audio', size: 'NT',
      codec: 'mp3', bitrate: '64' },
    { id: 'LATLVRN1DA-opus16', type: 'audio', size: 'NT',
      codec: 'opus', bitrate: '16' },
  ],
};

const GLU8: Translation = {
  abbr: 'GLU8',
  name: 'Latvian Glück 8th edition',
  language: 'Latvian',
  language_iso: 'lvs',
  filesets: [
    { id: 'LVSGLU8', type: 'text_plain', size: 'C',
      codec: null, bitrate: null },
    { id: 'LVSGLU8C1DA', type: 'audio', size: 'C',
      codec: null, bitrate: null },
    { id: 'LVSGLU8C2DA', type: 'audio', size: 'C',
      codec: null, bitrate: null },
  ],
};

const notInFileset = (filesetId: string): BookNotInFilesetError =>
  new BookNotInFilesetError(
    `Book JER chapter 1 is not available in fileset ${filesetId}`
  );

// happy-dom has no MediaMetadata — a minimal class carrying the
// init fields so assertions can read them back.
class FakeMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork?: MediaImage[];
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
    this.album = init.album ?? '';
    this.artwork = init.artwork;
  }
}

let session: MediaSessionStub;

const renderAudio = (
  storeOverrides: Partial<BibleState> = {},
) =>
  renderWithProviders(<Audio />, {
    storeOverrides: {
      activeBookId: 'JER',
      activeChapter: 1,
      activeAudioFilesetId: 'LAVLVR:audio:1',
      activeTextFilesetId: 'GLU8:text:1',
      translations: [LAVLVR, GLU8],
      showAudioPlayer: false,
      ...storeOverrides,
    },
  });

describe('Audio cross-translation fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeHowl.reset();
    session = stubMediaSession();
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  });

  afterEach(() => {
    session.restore();
    vi.unstubAllGlobals();
  });

  it('falls back to the read version\u2019s audio and ' +
    'notifies the user', async () => {
      // LAVLVR covers no Jeremiah audio (partial OT
      // recording); LVSGLU8C1DA does — production shape.
      vi.mocked(getBibleAudioUrl).mockImplementation(
        (_book, _chapter, filesetId) =>
          filesetId === 'LVSGLU8C1DA'
            ? Promise.resolve(
                'http://audio.test/LVSGLU8C1DA.mp3',
              )
            : Promise.reject(notInFileset(filesetId)),
      );
      renderAudio();

      fireEvent.click(screen.getByTitle('Play audio'));

      // The coverage-miss walk reaches the GLU8 generated
      // audio instead of erroring out inside LAVLVR.
      await waitFor(() =>
        expect(getBibleAudioUrl).toHaveBeenCalledWith(
          'JER',
          1,
          'LVSGLU8C1DA',
        ),
      );
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1),
      );
      expect(FakeHowl.instances[0].src).toEqual([
        'http://audio.test/LVSGLU8C1DA.mp3',
      ]);

      act(() => {
        FakeHowl.instances[0].emit('load');
      });
      await waitFor(() =>
        expect(FakeHowl.instances[0].playing()).toBe(true),
      );

      // A contextual notification names both versions: the
      // selected one has no audio for Jeremiah, the Glück
      // recording is playing instead.
      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining(
              'Latvian Glück 8th edition',
            ),
          }),
        ),
      );
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            '1953 British and Foreign Bible Society',
          ),
        }),
      );
      // The player stays open on the fallback recording.
      expect(
        screen.getByTitle('Close player'),
      ).toBeInTheDocument();
    },
  );

  it('shows an informative notification when no version has ' +
    'audio for the book', async () => {
      vi.mocked(getBibleAudioUrl).mockRejectedValue(
        notInFileset('any'),
      );
      renderAudio();

      fireEvent.click(screen.getByTitle('Play audio'));

      // Every candidate misses — the failure surfaces as an
      // informative notification naming the book, not a crash.
      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            color: 'orange',
            message: expect.stringContaining('Jeremiah'),
          }),
        ),
      );
      expect(FakeHowl.instances.length).toBe(0);
    },
  );
});
