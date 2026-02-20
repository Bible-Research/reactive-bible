import { Burger, Center, Header, useMantineTheme } from "@mantine/core";

const MyHeader = ({
  menuOpened,
  setMenuOpened,
}: {
  menuOpened: boolean;
  setMenuOpened: (opened: boolean) => void;
}) => {
  const theme = useMantineTheme();
  return (
    <Header height={56}>
      <Center
        h={56}
        px={10}
        mx="auto"
        sx={{ display: "flex", justifyContent: "space-between" }}
      >
        <Burger
          opened={menuOpened}
          onClick={() => setMenuOpened(!menuOpened)}
          size="sm"
          color={theme.colors.gray[6]}
          title={menuOpened ? "Close menu" : "Open menu"}
        />
      </Center>
    </Header>
  );
};

export default MyHeader;
