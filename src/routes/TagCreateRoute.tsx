import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { createTag, getTags } from "../api";
import { Tag } from "../types";

export default function TagCreateRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [parentTagId, setParentTagId] = useState<string | null>(null);

  // Parse parent from URL params
  const parentParam = searchParams.get("parent");

  useEffect(() => {
    const loadTags = async () => {
      setLoading(true);
      try {
        const fetchedTags = await getTags();
        setAllTags(fetchedTags);

        // Pre-select parent if provided in URL
        if (parentParam) {
          setParentTagId(parentParam);
        }
      } catch (err) {
        console.error("Failed to load tags:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTags();
  }, [parentParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const newTag = await createTag(name, parentTagId);
      navigate(`/tags/${newTag.id}`);
    } catch (err) {
      alert("Failed to create tag");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate("/tags");
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Box p="md" style={{ maxWidth: 600, margin: "0 auto" }}>
      <Paper shadow="sm" p="lg">
        <Title order={2} mb="md">
          Create New Tag
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
              Parent tags help organize your tags hierarchically. You can
              create nested tags like "Theology → Soteriology → Grace"
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
                Create Tag
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
