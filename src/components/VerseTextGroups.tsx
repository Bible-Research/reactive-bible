import { Box, Divider, Text } from "@mantine/core";
import type { VerseText } from "../hooks/useVerseTexts";

interface VerseTextGroupsProps {
  /**
   * Output of `groupVerseTexts` — [book/chapter label, verses]
   * pairs rendered under a centered divider each.
   */
  groups: [string, VerseText[]][];
}

// Shared "which verses does this note cover" preview, used by
// the add-note and edit-note modals.
const VerseTextGroups = ({ groups }: VerseTextGroupsProps) => (
  <>
    {groups.map(([label, groupVerses]) => (
      <Box key={label} mt="xl">
        <Divider my="sm" label={label} labelPosition="center" />
        {groupVerses.map((v) => (
          <Box key={v.verse} py={4} px={8}>
            <Text size="sm">
              <Text component="span" weight={700} mr={4}>
                {v.verse}
              </Text>
              {v.text}
            </Text>
          </Box>
        ))}
      </Box>
    ))}
  </>
);

export default VerseTextGroups;
