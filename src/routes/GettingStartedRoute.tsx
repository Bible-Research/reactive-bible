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

/** Entries with a real id, preserving catalogue order. */
const readyVideos = TUTORIAL_VIDEOS.filter(
  (v): v is TutorialVideo & { youtubeId: string } =>
    v.youtubeId !== null,
);

export default function GettingStartedRoute() {
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
      {/* Entries without a youtubeId are scripts waiting to be
          recorded — they never render, so the page grows as
          videos are published. */}
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
    </Box>
  );
}
