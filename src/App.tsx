import { MantineProvider, ColorSchemeProvider } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { clearExpiredAudioUrls } from "./utils/cacheManager";
import RootLayout from "./routes/RootLayout";
import BibleRoute from "./routes/BibleRoute";
import NotesListRoute from "./routes/NotesListRoute";
import NoteDetailRoute from "./routes/NoteDetailRoute";
import NoteEditRoute from "./routes/NoteEditRoute";
import NoteCreateRoute from "./routes/NoteCreateRoute";
import ErrorPage from "./routes/ErrorPage";

// Define routes
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to="/bible" replace />,
      },
      {
        path: "bible",
        element: <BibleRoute />,
      },
      {
        path: "bible/:book/:chapter",
        element: <BibleRoute />,
      },
      {
        path: "bible/:book/:chapter/:verse",
        element: <BibleRoute />,
      },
      {
        path: "notes",
        element: <NotesListRoute />,
      },
      {
        path: "notes/new",
        element: <NoteCreateRoute />,
      },
      {
        path: "notes/:noteId",
        element: <NoteDetailRoute />,
      },
      {
        path: "notes/:noteId/edit",
        element: <NoteEditRoute />,
      },
    ],
  },
]);

export default function App() {
  // Clean up expired audio URLs on app load
  useEffect(() => {
    clearExpiredAudioUrls();
  }, []);

  // Color scheme is now managed in RootLayout, but we need
  // MantineProvider at the top level
  const [colorScheme] = useLocalStorage({
    key: "color-scheme",
    defaultValue: "dark" as const,
  });

  return (
    <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={() => {}}>
      <MantineProvider
        theme={{ colorScheme }}
        withGlobalStyles
        withNormalizeCSS
      >
        <RouterProvider router={router} />
        <Analytics />
        <SpeedInsights />
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
