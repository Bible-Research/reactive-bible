import { useState } from 'react';
import { Button, Stack, Text } from '@mantine/core';
import { copyErrorDetails } from '../utils/errorReportDetails';
import { useTranslation } from 'react-i18next';

interface Props {
  error: Error;
  context?: string;
}

/**
 * Body of the global error notification: the error message plus
 * a button that copies a markdown report for a GitHub issue.
 */
export function ErrorNotificationContent({ error, context }: Props) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  return (
    <Stack spacing={4}>
      <Text size="sm">{error.message}</Text>
      <Text size="xs" color="dimmed">
        {t('errorBoundary.reportHint')}
      </Text>
      <Button
        size="xs"
        variant="light"
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => {
          void copyErrorDetails(error, context).then(setCopied);
        }}
      >
        {copied ? t('errorBoundary.copied') : t('errorBoundary.copyDetails')}
      </Button>
    </Stack>
  );
}
