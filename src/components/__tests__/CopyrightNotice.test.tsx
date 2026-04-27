import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import CopyrightNotice from '../CopyrightNotice';
import { renderWithProviders } from '../../__tests__/helpers';
import { FilesetCopyright } from '../../types';

const mockCopyrightData: FilesetCopyright[] = [
  {
    id: 'ENGESV',
    type: 'text_plain',
    size: 'C',
    copyright: '© 2001 Crossway Bibles',
    copyright_date: '2001',
    copyright_description:
      'The Holy Bible, English Standard Version',
  },
];

vi.mock('../../api', () => ({
  getCopyrightInfo: vi.fn(),
}));

import { getCopyrightInfo } from '../../api';

const mockedGetCopyrightInfo =
  getCopyrightInfo as unknown as ReturnType<
    typeof vi.fn
  >;

describe('CopyrightNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders copyright text when data is available', async () => {
    mockedGetCopyrightInfo.mockResolvedValue(
      mockCopyrightData
    );

    renderWithProviders(<CopyrightNotice />, {
      stores: {
        bible: {
          activeTextFilesetId: 'ENGESV',
          translations: [
            {
              abbr: 'ENGESV',
              name: 'English Standard Version',
              language: 'English',
              language_iso: 'eng',
              filesets: [
                {
                  id: 'ENGESV',
                  type: 'text_plain',
                  size: 'C',
                  codec: null,
                  bitrate: null,
                },
              ],
            },
          ],
        },
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'The Holy Bible, English Standard Version'
        )
      ).toBeInTheDocument();
    });
  });

  it('renders nothing with empty translations', async () => {
    mockedGetCopyrightInfo.mockResolvedValue([]);

    const { container } = renderWithProviders(
      <CopyrightNotice />,
      {
        stores: {
          bible: {
            activeTextFilesetId: 'ENGESV',
            translations: [],
          },
        },
      }
    );

    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('renders nothing when API returns empty array', async () => {
    mockedGetCopyrightInfo.mockResolvedValue([]);

    const { container } = renderWithProviders(
      <CopyrightNotice />,
      {
        stores: {
          bible: {
            activeTextFilesetId: 'ENGESV',
            translations: [
              {
                abbr: 'ENGESV',
                name: 'ESV',
                language: 'English',
                language_iso: 'eng',
                filesets: [
                  {
                    id: 'ENGESV',
                    type: 'text_plain',
                    size: 'C',
                    codec: null,
                    bitrate: null,
                  },
                ],
              },
            ],
          },
        },
      }
    );

    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });
});
