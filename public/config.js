/**
 * Runtime Frontend Configuration
 * ───────────────────────────────
 * This file is loaded by index.html BEFORE the React app.
 * It can be replaced at deploy-time (Docker COPY or volume mount)
 * without rebuilding the frontend.
 *
 * Usage in React: import { getConfig } from '../lib/config';
 *
 * For local development, Vite env vars (VITE_*) take precedence
 * via import.meta.env. This file provides production overrides.
 */
window.__JEWELERP_CONFIG__ = {
  // API base URL — leave as '/api' when frontend and backend share a domain
  // Set to 'https://api.jewelerp.com/api' for cross-origin deployments
  API_URL: '/api',

  // App display name (shown in title bar, login page)
  APP_NAME: 'JewelERP',
};
