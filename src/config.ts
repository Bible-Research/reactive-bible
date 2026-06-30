/**
 * Runtime configuration resolved from Vite env vars.
 * VITE_API_BASE_URL overrides the default in development via a local `.env`.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
  || 'https://bible-research-489314.ey.r.appspot.com';
