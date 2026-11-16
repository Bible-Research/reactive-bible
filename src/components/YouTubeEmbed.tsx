import { useState } from 'react';
import {
  Anchor,
  AspectRatio,
  Box,
  UnstyledButton,
} from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';

interface YouTubeEmbedProps {
  /** YouTube video id (11-char id, not a URL). */
  videoId: string;
  /** Used for the iframe title and the play control's label. */
  title: string;
}

/**
 * Click-to-play YouTube facade. The video renders as a thumbnail
 * with a play control and only swaps in the real player iframe on
 * activation — a page listing many videos never pays YouTube's
 * ~600 KB player cost up front.
 */
export default function YouTubeEmbed({
  videoId,
  title,
}: YouTubeEmbedProps) {
  const [activated, setActivated] = useState(false);

  return (
    <Box>
      <AspectRatio ratio={16 / 9}>
        {activated ? (
          <iframe
            src={
              `https://www.youtube-nocookie.com/embed/` +
              `${videoId}?autoplay=1&rel=0`
            }
            title={title}
            // Privacy-enhanced domain; do NOT add referrerPolicy
            // (the player needs a Referer — stripping it breaks
            // playback) or sandbox (it needs scripts/same-origin).
            allow={
              'accelerometer; autoplay; clipboard-write; ' +
              'encrypted-media; gyroscope; picture-in-picture; ' +
              'web-share'
            }
            allowFullScreen
            loading="lazy"
            style={{ border: 0 }}
          />
        ) : (
          <UnstyledButton
            onClick={() => setActivated(true)}
            aria-label={`Play video: ${title}`}
            sx={{
              position: 'relative',
              display: 'block',
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
            }}
          >
            <Box
              component="img"
              src={
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
              }
              alt=""
              loading="lazy"
              sx={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <Box
              aria-hidden
              sx={(theme) => ({
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor:
                  theme.fn.rgba(theme.black, 0.6),
                color: theme.white,
              })}
            >
              <IconPlayerPlay size={32} />
            </Box>
          </UnstyledButton>
        )}
      </AspectRatio>
      {/* Escape hatch: the Android shell cannot fullscreen
          embedded video, and some users prefer the YouTube app. */}
      <Anchor
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        mt="xs"
        sx={{ display: 'inline-block' }}
      >
        Watch on YouTube
      </Anchor>
    </Box>
  );
}
