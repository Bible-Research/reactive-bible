import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";
import { Title, Text, Button, Stack, Center } from "@mantine/core";

export default function ErrorPage() {
  const error = useRouteError();
  
  let errorMessage: string;
  
  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || error.data?.message || "Unknown error";
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = "An unexpected error occurred";
  }

  return (
    <Center h="100vh">
      <Stack align="center" spacing="md">
        <Title order={1}>Oops!</Title>
        <Text size="lg" color="dimmed">
          Sorry, an unexpected error has occurred.
        </Text>
        <Text size="sm" color="red">
          {errorMessage}
        </Text>
        <Button component={Link} to="/" variant="filled">
          Go Home
        </Button>
      </Stack>
    </Center>
  );
}
