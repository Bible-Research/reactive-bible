import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Title,
  Button,
  Stack,
  Group,
  Text,
  Loader,
  Center,
  ActionIcon,
  Badge,
} from "@mantine/core";
import { IconEdit, IconTrash, IconPlus, IconFolder } from "@tabler/icons-react";
import { getTags, deleteTag, getNotes } from "../api";
import { Tag } from "../types";

export default function TagsListRoute() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoading(true);
    try {
      const fetchedTags = await getTags();
      setTags(fetchedTags);
      
      // Load note counts for each tag
      const counts: Record<string, number> = {};
      await Promise.all(
        fetchedTags.map(async (tag) => {
          try {
            const notes = await getNotes(tag.id);
            counts[tag.id] = notes.length;
          } catch {
            counts[tag.id] = 0;
          }
        })
      );
      setNoteCounts(counts);
    } catch (err) {
      console.error("Failed to load tags:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tagId: string, tagName: string) => {
    if (!confirm(`Delete tag "${tagName}"? This will not delete the notes.`)) {
      return;
    }

    try {
      await deleteTag(tagId);
      await loadTags(); // Refresh list
    } catch (err) {
      alert("Failed to delete tag");
      console.error(err);
    }
  };

  // Build tag hierarchy
  const buildHierarchy = () => {
    const tagMap = new Map(tags.map((tag) => [tag.id, { ...tag, children: [] as Tag[] }]));
    const rootTags: (Tag & { children: Tag[] })[] = [];

    tags.forEach((tag) => {
      const tagWithChildren = tagMap.get(tag.id)!;
      if (tag.parent_tag) {
        const parent = tagMap.get(tag.parent_tag);
        if (parent) {
          parent.children.push(tagWithChildren);
        } else {
          rootTags.push(tagWithChildren);
        }
      } else {
        rootTags.push(tagWithChildren);
      }
    });

    return rootTags;
  };

  const renderTag = (tag: Tag & { children: Tag[] }, level = 0) => {
    const noteCount = noteCounts[tag.id] || 0;
    
    return (
      <Box key={tag.id}>
        <Paper
          p="sm"
          withBorder
          style={{ marginLeft: level * 20 }}
          sx={(theme) => ({
            cursor: "pointer",
            "&:hover": {
              backgroundColor:
                theme.colorScheme === "dark"
                  ? theme.colors.dark[6]
                  : theme.colors.gray[0],
            },
          })}
        >
          <Group position="apart">
            <Group
              onClick={() => navigate(`/tags/${tag.id}`)}
              style={{ flex: 1 }}
            >
              <IconFolder size={18} />
              <Text weight={500}>{tag.name}</Text>
              <Badge size="sm">{noteCount} notes</Badge>
            </Group>
            <Group spacing="xs">
              <ActionIcon
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/tags/${tag.id}/edit`);
                }}
                title="Edit"
              >
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(tag.id, tag.name);
                }}
                color="red"
                title="Delete"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Paper>
        {tag.children && tag.children.length > 0 && (
          <Box mt="xs">
            {tag.children.map((child) =>
              renderTag(child as Tag & { children: Tag[] }, level + 1)
            )}
          </Box>
        )}
      </Box>
    );
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  const hierarchy = buildHierarchy();

  return (
    <Box p="md" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Group position="apart" mb="md">
        <Title order={2}>Tags</Title>
        <Button
          leftIcon={<IconPlus size={18} />}
          onClick={() => navigate("/tags/new")}
        >
          Create Tag
        </Button>
      </Group>

      {tags.length === 0 ? (
        <Center h="50vh">
          <Stack align="center">
            <Text color="dimmed">No tags yet</Text>
            <Button onClick={() => navigate("/tags/new")}>
              Create Your First Tag
            </Button>
          </Stack>
        </Center>
      ) : (
        <Stack spacing="sm">
          {hierarchy.map((tag) => renderTag(tag))}
        </Stack>
      )}
    </Box>
  );
}
