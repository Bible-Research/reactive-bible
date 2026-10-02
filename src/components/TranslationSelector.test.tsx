import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
} from 'vitest';
import TranslationSelector from './TranslationSelector';
import { useBibleStore } from '../store';
import * as api from '../api';

// Mock the API
vi.mock('../api', () => ({
  getAvailableTranslations: vi.fn(),
}));

const initialStoreState = useBibleStore.getState();

describe('TranslationSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      ...initialStoreState,
      translations: [],
      activeTextFilesetId: 'ENGESV',
      activeAudioFilesetId: null,
      setTranslations: vi.fn(),
      setActiveTextFilesetId: vi.fn(),
      setActiveAudioFilesetId: vi.fn(),
    });

    (api.getAvailableTranslations as Mock).mockResolvedValue([
      {
        abbr: 'KJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          { id: 'ENGKJV', type: 'text_plain', size: 'NT' },
        ],
      },
    ]);
  });

  it('should render the Change Translation button', () => {
    render(<TranslationSelector />);
    expect(
      screen.getByRole('button', { name: 'Change Translation' })
    ).toBeInTheDocument();
  });

  it('should open modal when button is clicked', () => {
    render(<TranslationSelector />);
    const button = screen.getByRole('button', 
      { name: 'Change Translation' });
    fireEvent.click(button);

    // Modal should be visible with title
    expect(
      screen.getByText('Select Translation')
    ).toBeInTheDocument();
  });

  // Note: Testing modal interactions with Select dropdowns
  // is problematic due to portal rendering.
  // See SKIPPED_TESTS.md for details.
  it.skip('should display available translations', async () => {
    render(<TranslationSelector />);
    const button = screen.getByRole('button', 
      { name: 'Change Translation' });
    await userEvent.click(button);

    // This test is skipped because Select component renders
    // options in a portal that's not accessible in tests
  });

  it('refreshes translations from the API when modal opens', async () => {
    const mock = api.getAvailableTranslations as unknown as ReturnType<
      typeof vi.fn
    >;

    render(<TranslationSelector />);

    // Initial mount triggers a cached fetch (forceRefresh=false).
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng');
    });
    mock.mockClear();

    const button = screen.getByRole('button',
      { name: 'Change Translation' });
    fireEvent.click(button);

    // Opening the modal must trigger an async refresh that
    // bypasses the cache so newly available translations from
    // the API show up without a manual cache bust.
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng', true);
    });
  });

  it('refreshes again on each re-open of the modal', async () => {
    const mock = api.getAvailableTranslations as unknown as ReturnType<
      typeof vi.fn
    >;

    render(<TranslationSelector />);
    const button = screen.getByRole('button',
      { name: 'Change Translation' });

    fireEvent.click(button);
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng', true);
    });

    // Close the modal.
    fireEvent.click(screen.getByRole('button',
      { name: /cancel/i }));

    mock.mockClear();

    // Re-open: must fetch fresh translations again.
    fireEvent.click(button);
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng', true);
    });
  });

  it('updates the translations store with freshly fetched list', async () => {
    const setTranslations = vi.fn();
    useBibleStore.setState({
      ...initialStoreState,
      translations: [],
      activeTextFilesetId: 'ENGESV',
      activeAudioFilesetId: null,
      setTranslations,
      setActiveTextFilesetId: vi.fn(),
      setActiveAudioFilesetId: vi.fn(),
    });

    const freshTranslations = [
      {
        abbr: 'NIV',
        name: 'New International Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          { id: 'ENGNIV', type: 'text_plain', size: 'C' },
        ],
      },
    ];
    const mock = api.getAvailableTranslations as unknown as ReturnType<
      typeof vi.fn
    >;
    mock.mockImplementation(
      (_iso: string, forceRefresh?: boolean) =>
        Promise.resolve(
          forceRefresh ? freshTranslations : []
        )
    );

    render(<TranslationSelector />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Change Translation' })
    );

    await waitFor(() => {
      expect(setTranslations).toHaveBeenCalledWith(
        freshTranslations
      );
    });
  });

  describe('grouped fileset options', () => {
    const textFs = (id: string, size = 'C') => ({
      id,
      type: 'text_plain' as const,
      size,
      codec: null,
      bitrate: null,
    });
    const audioFs = (
      id: string,
      size = 'C',
      drama = false,
    ) => ({
      id,
      type: (drama ? 'audio_drama' : 'audio') as
        'audio' | 'audio_drama',
      size,
      codec: null,
      bitrate: null,
    });

    const esv = {
      abbr: 'ENGESV',
      name: 'English Standard Version',
      language: 'English',
      language_iso: 'eng',
      filesets: [
        textFs('ENGESVO_ET', 'OT'),
        textFs('ENGESVN_ET', 'NT'),
        textFs('ENGESV_API', 'C'),
        audioFs('ENGESV_API', 'C'),
        audioFs('ENGESVN2DA', 'NT', true),
        audioFs('ENGESVN2DA-opus16', 'NT', true),
      ],
    };
    const web = {
      abbr: 'ENGWEB',
      name: 'World English Bible',
      language: 'English',
      language_iso: 'eng',
      // NT-only text — must lose to a Full Bible on auto-pick.
      filesets: [textFs('ENGWEBN_ET', 'NT')],
    };
    const csb = {
      abbr: 'ENGCSB',
      name: 'Christian Standard Bible',
      language: 'English',
      language_iso: 'eng',
      // Audio-only translation.
      filesets: [
        audioFs('ENGCSBN1DA', 'NT'),
        audioFs('ENGCSBN1DA-opus16', 'NT'),
      ],
    };
    const engTranslations = [csb, web, esv];

    const useRealStore = (
      overrides: Record<string, unknown> = {},
    ) => {
      useBibleStore.setState({
        ...initialStoreState,
        translations: engTranslations,
        ...overrides,
      });
      (api.getAvailableTranslations as Mock).mockResolvedValue(
        engTranslations,
      );
    };

    const openAndPickVersion = async (optionText: string) => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Change Translation' }),
      );
      await userEvent.click(
        await screen.findByPlaceholderText('Choose a version'),
      );
      await userEvent.click(await screen.findByText(optionText));
    };

    const save = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    };

    it('auto-selects a full-coverage same-language text for ' +
      'audio-only versions', async () => {
      // Active text is a Latvian fileset — a different language
      // than the eng list the selector is showing.
      useRealStore({ activeTextFilesetId: 'LATLVRN_ET' });
      render(<TranslationSelector />);

      await openAndPickVersion('Christian Standard Bible (ENGCSB)');

      // The NT-only WEB translation is listed before ESV but
      // the full-coverage ESV must win the auto-pick.
      expect(
        await screen.findByText(
          'Text: English Standard Version — auto-selected',
        ),
      ).toBeInTheDocument();
      // Audio-only versions default to their first audio option.
      expect(
        screen.getByRole('radio', {
          name: 'Read aloud — New Testament only',
        }),
      ).toBeChecked();

      save();
      expect(useBibleStore.getState().activeTextFilesetId).toBe(
        'ENGESV:text:0',
      );
      expect(useBibleStore.getState().activeAudioFilesetId).toBe(
        'ENGCSB:audio:0',
      );
    });

    it('keeps the active same-language text for audio-only ' +
      'versions', async () => {
      const niv = {
        abbr: 'ENGNIV',
        name: 'New International Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          textFs('ENGNIVO_ET', 'OT'),
          textFs('ENGNIVN_ET', 'NT'),
        ],
      };
      useBibleStore.setState({
        ...initialStoreState,
        translations: [csb, niv],
        activeTextFilesetId: 'ENGNIVN_ET',
        activeAudioFilesetId: null,
      });
      (api.getAvailableTranslations as Mock).mockResolvedValue([
        csb,
        niv,
      ]);
      render(<TranslationSelector />);

      await openAndPickVersion('Christian Standard Bible (ENGCSB)');

      expect(
        await screen.findByText('Text: New International Version'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/auto-selected/),
      ).not.toBeInTheDocument();

      save();
      expect(useBibleStore.getState().activeTextFilesetId).toBe(
        'ENGNIVN_ET',
      );
    });

    it('shows product audio options and stores product ids on ' +
      'save', async () => {
      useRealStore({
        translations: [esv],
        activeTextFilesetId: 'ENGESV_API',
        activeAudioFilesetId: 'ENGESV_API',
      });
      (api.getAvailableTranslations as Mock).mockResolvedValue([
        esv,
      ]);
      render(<TranslationSelector />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Change Translation' }),
      );

      // Legacy member ids map back onto their products.
      expect(
        await screen.findByRole('radio', {
          name: 'Read aloud — Full Bible',
        }),
      ).toBeChecked();
      expect(
        screen.getByRole('radio', {
          name: 'Dramatized — New Testament only',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Auto-resolved per testament/),
      ).toBeInTheDocument();

      save();
      expect(useBibleStore.getState().activeTextFilesetId).toBe(
        'ENGESV:text:0',
      );
      expect(useBibleStore.getState().activeAudioFilesetId).toBe(
        'ENGESV:audio:0',
      );
    });

    it('stores a concrete member id chosen in Advanced and ' +
      'hides opus16 variants', async () => {
      useRealStore({
        translations: [esv],
        activeTextFilesetId: 'ENGESV_API',
        activeAudioFilesetId: 'ENGESV_API',
      });
      (api.getAvailableTranslations as Mock).mockResolvedValue([
        esv,
      ]);
      render(<TranslationSelector />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Change Translation' }),
      );
      await screen.findByRole('radio', {
        name: 'Read aloud — Full Bible',
      });

      const advanced = screen.getByRole('button', {
        name: /Advanced/,
      });
      expect(advanced).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(advanced);
      expect(advanced).toHaveAttribute('aria-expanded', 'true');

      // opus16 filesets are never shown — codec is automatic.
      expect(screen.queryByText(/opus16/)).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('radio', { name: 'ENGESVN_ET' }),
      );
      await userEvent.click(
        screen.getByRole('radio', {
          name: 'Drama NT (ENGESVN2DA)',
        }),
      );
      save();
      expect(useBibleStore.getState().activeTextFilesetId).toBe(
        'ENGESVN_ET',
      );
      expect(useBibleStore.getState().activeAudioFilesetId).toBe(
        'ENGESVN2DA',
      );
    });

    it('reopens on the audio owner when the text is borrowed',
      async () => {
        // CSB audio + auto-borrowed NIV text: reopening must show
        // CSB — the version the user picked — not NIV, and a
        // no-op Save must keep the audio selection.
        const niv = {
          abbr: 'ENGNIV',
          name: 'New International Version',
          language: 'English',
          language_iso: 'eng',
          filesets: [
            textFs('ENGNIVO_ET', 'OT'),
            textFs('ENGNIVN_ET', 'NT'),
          ],
        };
        useRealStore({
          translations: [csb, niv],
          activeTextFilesetId: 'ENGNIVN_ET',
          activeAudioFilesetId: 'ENGCSB:audio:0',
        });
        (api.getAvailableTranslations as Mock).mockResolvedValue([
          csb,
          niv,
        ]);
        render(<TranslationSelector />);
        fireEvent.click(
          screen.getByRole('button', { name: 'Change Translation' }),
        );

        await waitFor(() => {
          expect(
            screen.getByPlaceholderText('Choose a version'),
          ).toHaveValue('Christian Standard Bible (ENGCSB)');
        });
        expect(
          screen.getByRole('radio', {
            name: 'Read aloud — New Testament only',
          }),
        ).toBeChecked();

        save();
        expect(
          useBibleStore.getState().activeAudioFilesetId,
        ).toBe('ENGCSB:audio:0');
        expect(
          useBibleStore.getState().activeTextFilesetId,
        ).toBe('ENGNIVN_ET');
      });

    it('seeds the language tab from the active selection',
      async () => {
        const lavnli = {
          abbr: 'LAVNLI',
          name: 'Latvian New Interconfessional',
          language: 'Latvian',
          language_iso: 'lvs',
          filesets: [
            audioFs('LATBSLN1DA', 'NT'),
            audioFs('LATBSLN1DA-opus16', 'NT'),
          ],
        };
        useRealStore({
          activeTextFilesetId: null,
          activeAudioFilesetId: 'LAVNLI:audio:0',
        });
        (api.getAvailableTranslations as Mock).mockImplementation(
          (iso: string) =>
            Promise.resolve(iso === 'lvs' ? [lavnli] : engTranslations),
        );
        render(<TranslationSelector />);
        fireEvent.click(
          screen.getByRole('button', { name: 'Change Translation' }),
        );

        await waitFor(() => {
          expect(
            screen.getByRole('radio', { name: 'Latvian' }),
          ).toBeChecked();
        });
      });

    it('disables Save until a version is selected', async () => {
      // A stale selection with no owning translation must not be
      // wiped by a no-op Save.
      useRealStore({
        activeTextFilesetId: 'STALE_ID',
        activeAudioFilesetId: null,
      });
      render(<TranslationSelector />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Change Translation' }),
      );

      const saveButton = await screen.findByRole('button', {
        name: 'Save',
      });
      expect(saveButton).toBeDisabled();

      await userEvent.click(
        await screen.findByPlaceholderText('Choose a version'),
      );
      await userEvent.click(
        await screen.findByText('English Standard Version (ENGESV)'),
      );
      expect(saveButton).toBeEnabled();
    });

    it('normalizes a drifted product id to the backend option',
      async () => {
        // Pre-rollout persisted ids are 0-based; a backend that
        // mints 1-based ids makes `ENGESV:audio:0` drift — reopen
        // resolves it via the `{abbr}:{kind}` prefix fallback and
        // Save re-persists the canonical id.
        const esvBackend = {
          ...esv,
          text_options: [
            {
              id: 'ENGESV:text:1',
              kind: 'text',
              by_testament: { OT: 'ENGESV_API', NT: 'ENGESV_API' },
              members: ['ENGESV_API'],
            },
          ],
          audio_options: [
            {
              id: 'ENGESV:audio:1',
              kind: 'audio',
              by_testament: { OT: 'ENGESV_API', NT: 'ENGESV_API' },
              members: ['ENGESV_API'],
            },
          ],
        };
        useRealStore({
          translations: [esvBackend],
          activeTextFilesetId: 'ENGESV:text:0',
          activeAudioFilesetId: 'ENGESV:audio:0',
        });
        (api.getAvailableTranslations as Mock).mockResolvedValue([
          esvBackend,
        ]);
        render(<TranslationSelector />);
        fireEvent.click(
          screen.getByRole('button', { name: 'Change Translation' }),
        );

        expect(
          await screen.findByRole('radio', {
            name: 'Read aloud — Full Bible',
          }),
        ).toBeChecked();

        save();
        expect(useBibleStore.getState().activeTextFilesetId).toBe(
          'ENGESV:text:1',
        );
        expect(useBibleStore.getState().activeAudioFilesetId).toBe(
          'ENGESV:audio:1',
        );
      });

    it('stores null when audio is set to None', async () => {
      useRealStore({
        translations: [esv],
        activeTextFilesetId: 'ENGESV_API',
        activeAudioFilesetId: 'ENGESV_API',
      });
      (api.getAvailableTranslations as Mock).mockResolvedValue([
        esv,
      ]);
      render(<TranslationSelector />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Change Translation' }),
      );
      await screen.findByRole('radio', {
        name: 'Read aloud — Full Bible',
      });

      await userEvent.click(
        screen.getByRole('radio', { name: 'None' }),
      );
      save();
      expect(
        useBibleStore.getState().activeAudioFilesetId,
      ).toBeNull();
    });
  });
});
