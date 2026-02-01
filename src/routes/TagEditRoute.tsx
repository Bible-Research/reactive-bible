import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Title,
  Button,
  Stack,
  TextInput,
  Select,
  Loader,
  Center,
  Text,
  Group,
} from "@mantine/core";
import { getTag, updateTag, getTags } from "../api";
import { Tag } from "../types";

export default function TagEditRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const [tag, setTag] = useState<Tag | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [parentTagId, setParentTagId] = useState<string | null>(null);

  useEffect(() => {
    if (!tagId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedTag, fetchedTags] = await Promise.all([
          getTag(tagId),
          getTags(),
        ]);
        setTag(fetchedTag);
        setAllTags(fetchedTags.filter((t) => t.id !== tagId)); // Exclude self
        setName(fetchedTag.name);
        setParentTagId(fetchedTag.parent_tag);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tag"
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tagId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagId || !name.trim()) return;

    setSaving(true);
    try {
      await updateTag(tagId, name, parentTagId);
      navigate(`/tags/${tagId}`);
    } catch (err) {
      alert("Failed to update tag");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate(`/tags/${tagId}`);
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error || !tag) {
    return (
      <Center h="80vh">
        <Stack align="center">
          <Text color="red">{error || "Tag not found"}</Text>
          <Button onClick={() => navigate("/tags")}>Back to Tags</Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Box p="md" style={{ maxWidth: 600, margin: "0 auto" }}>
      <Paper shadow="sm" p="lg">
        <Title order={2} mb="md">
          Edit Tag
        </Title>

        <form onSubmit={handleSubmit}>
          <Stack spacing="md">
            <TextInput
              label="Tag Name"
              placeholder="Enter tag name..."
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              autoFocus
            />

            <Select
              label="Parent Tag (Optional)"
              placeholder="Select parent tag..."
              value={parentTagId || ""}
              onChange={(value) => setParentTagId(value || null)}
              data={[
                { value: "", label: "None (Root Tag)" },
                ...allTags.map((t) => ({
                  value: t.id,
                  label: t.name,
                })),
              ]}
              searchable
              clearable
            />

            <Text size="xs" color="dimmed">
              Parent tags help organize your tags hierarchically
            </Text>

            <Group position="right">
              <Button
                variant="subtle"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save Changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
