/**
 * Runtime configuration resolved from Vite env vars.
 * VITE_API_BASE_URL overrides the default in development via
 * a local `.env`. A whitespace-only value is treated as unset.
 *
 * With no explicit override, `*.vercel.app` hosts resolve to
 * '' — same-origin `/api` calls that vercel.json rewrites to
 * the backend. Works on EVERY alias (deployment URL, branch
 * alias, custom staging domain); a baked-in deployment URL
 * would force cross-origin calls that fail CORS preflight.
 */
const envBase = (import.meta.env.VITE_API_BASE_URL as
  string | undefined)
  ?.trim()
  .replace(/\/+$/, '');

export const API_BASE_URL: string =
  envBase ||
  (typeof window !== 'undefined' &&
   window.location.hostname.endsWith('.vercel.app')
    ? ''
    : 'https://bible-research-489314.ey.r.appspot.com');
