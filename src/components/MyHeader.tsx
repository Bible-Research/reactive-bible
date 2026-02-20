import {
  Burger,
  Center,
  ColorScheme,
  Group,
  Header,
  Switch,
  useMantineTheme,
} from "@mantine/core";
import { IconMoonStars, IconSun } from "@tabler/icons-react";

const MyHeader = ({
  colorScheme,
  toggleColorScheme,
  menuOpened,
  setMenuOpened,
}: {
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
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

        <Group position="center">
          <Switch
            checked={colorScheme === "dark"}
            onChange={toggleColorScheme}
            size="lg"
            onLabel={
              <IconSun color={theme.white} size="1.25rem" stroke={1.5} />
            }
            offLabel={
              <IconMoonStars
                color={theme.colors.gray[6]}
                size="1.25rem"
                stroke={1.5}
              />
            }
          />
        </Group>
      </Center>
    </Header>
  );
};

export default MyHeader;
