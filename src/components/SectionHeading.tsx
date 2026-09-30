import { Title, Box, createStyles } from "@mantine/core";

const useStyles = createStyles((theme) => ({
  clickable: {
    cursor: "pointer",
    transition: "background-color 150ms ease",
    borderRadius: theme.radius.sm,
    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[5]
          : theme.colors.gray[1],
    },
  },
}));

const SectionHeading = ({
  text,
  onClick,
  id,
}: {
  text: string;
  onClick?: () => void;
  id?: string;
}) => {
  const { classes, cx } = useStyles();
  return (
    <Box
      px={10}
      pt="md"
      pb="xs"
      id={id}
      className={cx({ [classes.clickable]: !!onClick })}
      onClick={onClick}
    >
      <Title order={4} weight={700} color="dimmed">
        {text}
      </Title>
    </Box>
  );
};

export default SectionHeading;
