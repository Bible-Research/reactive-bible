/**
 * Runtime configuration resolved from Vite env vars.
 * VITE_API_BASE_URL overrides the default in development via a local `.env`.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
  || 'https://bible-research-489314.ey.r.appspot.com';

/**
 * ESV API key for passage search functionality.
 * Set VITE_ESV_API_KEY in your environment variables.
 */
export const ESV_API_KEY: string | undefined =
  import.meta.env.VITE_ESV_API_KEY as string | undefined;
