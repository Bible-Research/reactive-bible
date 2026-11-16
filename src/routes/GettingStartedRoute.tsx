import {
  Box,
  Card,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useBibleStore } from '../store';
import {
  TUTORIAL_VIDEOS,
  type TutorialVideo,
} from '../data/gettingStartedVideos';
import { resolveTutorialYoutubeId } from '../utils/tutorialVideos';
import YouTubeEmbed from '../components/YouTubeEmbed';

export default function GettingStartedRoute() {
  const { t } = useTranslation();
  const uiLanguage = useBibleStore((state) => state.uiLanguage);

  // Entries with no recording in the active locale (or English
  // fallback) are scripts waiting to be recorded — they never
  // render, so the page grows as videos are published.
  // Filtered inside render so tests can swap the mocked
  // catalogue per test.
  const readyVideos = TUTORIAL_VIDEOS.map((video) => ({
    video,
    youtubeId: resolveTutorialYoutubeId(
      video.youtubeIds,
      uiLanguage,
    ),
  })).filter(
    (entry): entry is {
      video: TutorialVideo;
      youtubeId: string;
    } => entry.youtubeId !== null,
  );

  // Catalogue ids are stable keys in the shipped catalogs —
  // typed keys can't express `tutorials.${id}` so resolve
  // through a widened t.
  const tr = t as (key: string) => string;

  return (
    <Box p="md" maw={800} mx="auto">
      <Title order={2} mb="md">
        {t('tutorials.heading')}
      </Title>
      <Text mb="lg">
        {t('tutorials.intro')}
      </Text>
      {readyVideos.length === 0 ? (
        <Text color="dimmed">
          {t('tutorials.empty')}
        </Text>
      ) : (
        <Stack spacing="lg">
          {readyVideos.map(({ video, youtubeId }) => {
            const title = tr(`tutorials.${video.id}.title`);
            return (
              <Card
                key={video.id}
                withBorder
                shadow="sm"
                padding="md"
                radius="md"
              >
                <Title order={3} size="h4" mb="xs">
                  {title}
                </Title>
                <Text size="sm" color="dimmed" mb="sm">
                  {tr(`tutorials.${video.id}.description`)}
                </Text>
                <YouTubeEmbed
                  videoId={youtubeId}
                  title={title}
                />
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
