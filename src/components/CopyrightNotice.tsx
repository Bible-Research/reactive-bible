import { useEffect, useState } from 'react';
import { Text, Box } from '@mantine/core';
import { useBibleStore } from '../store';
import { getCopyrightInfo } from '../api';
import { shallow } from 'zustand/shallow';

const CopyrightNotice = () => {
  const { activeTextFilesetId, translations } =
    useBibleStore(
      (state) => ({
        activeTextFilesetId: state.activeTextFilesetId,
        translations: state.translations,
      }),
      shallow
    );
  const [copyright, setCopyright] = useState<string>('');

  useEffect(() => {
    if (!activeTextFilesetId) {
      setCopyright('');
      return;
    }

    if (activeTextFilesetId === 'ENGESV_API') {
      setCopyright(
        'Scripture quotations are from the ESV\u00ae Bible ' +
        '(The Holy Bible, English Standard Version\u00ae), ' +
        'copyright \u00a9 2001 by Crossway, a publishing ' +
        'ministry of Good News Publishers. Used by ' +
        'permission. All rights reserved.'
      );
      return;
    }

    if (translations.length === 0) {
      setCopyright('');
      return;
    }

    // Find the bible_id (abbr) for the active text fileset
    const translation = translations.find((t) =>
      t.filesets.some(
        (f) => f.id === activeTextFilesetId
      )
    );
    if (!translation) {
      setCopyright('');
      return;
    }

    const bibleId = translation.abbr;
    let stale = false;

    getCopyrightInfo(bibleId).then((data) => {
      if (stale) return;

      // Find the text fileset's copyright
      const textCr = data.find(
        (c) => c.id === activeTextFilesetId
      );
      // Fallback: use first text_plain type, then first entry
      const cr =
        textCr ||
        data.find((c) => c.type === 'text_plain') ||
        data[0];

      if (cr) {
        const text =
          cr.copyright_description || cr.copyright || '';
        setCopyright(text ? `Copyright: ${text}` : '');
      } else {
        setCopyright('');
      }
    });

    return () => { stale = true; };
  }, [activeTextFilesetId, translations]);

  if (!copyright) return null;

  return (
    <Box py="md" px="sm">
      <Text size="xs" color="dimmed" align="center" italic>
        {copyright}
      </Text>
    </Box>
  );
};

export default CopyrightNotice;
