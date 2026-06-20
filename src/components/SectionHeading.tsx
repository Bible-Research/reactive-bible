import { Title, Box } from "@mantine/core";

const SectionHeading = ({ text }: { text: string }) => (
  <Box px={10} pt="md" pb="xs">
    <Title order={4} weight={700} color="dimmed">
      {text}
    </Title>
  </Box>
);

export default SectionHeading;
