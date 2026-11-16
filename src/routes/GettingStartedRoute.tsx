import {
  Box,
  Card,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  TUTORIAL_VIDEOS,
  type TutorialVideo,
} from '../data/gettingStartedVideos';
import YouTubeEmbed from '../components/YouTubeEmbed';

export default function GettingStartedRoute() {
  // Entries without a youtubeId are scripts waiting to be
  // recorded — they never render, so the page grows as videos
  // are published. Filtered inside render so tests can swap
  // the mocked catalogue per test.
  const readyVideos = TUTORIAL_VIDEOS.filter(
    (v): v is TutorialVideo & { youtubeId: string } =>
      v.youtubeId !== null,
  );

  return (
    <Box p="md" maw={800} mx="auto">
      <Title order={2} mb="md">
        Getting started
      </Title>
      <Text mb="lg">
        New here? These short video tutorials walk through the
        app&rsquo;s features — from reading and searching the
        Bible to notes, tags, and audio. Watch them in order or
        jump straight to the feature you need.
      </Text>
      {readyVideos.length === 0 ? (
        <Text color="dimmed">
          Tutorials are being recorded — check back soon.
        </Text>
      ) : (
        <Stack spacing="lg">
          {readyVideos.map((video) => (
            <Card
              key={video.id}
              withBorder
              shadow="sm"
              padding="md"
              radius="md"
            >
              <Title order={3} size="h4" mb="xs">
                {video.title}
              </Title>
              <Text size="sm" color="dimmed" mb="sm">
                {video.description}
              </Text>
              <YouTubeEmbed
                videoId={video.youtubeId}
                title={video.title}
              />
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
