/**
 * Frontend Configuration
 * ──────────────────────
 * Merges three config sources (highest priority first):
 *   1. Runtime: window.__JEWELERP_CONFIG__ (from public/config.js, replaceable at deploy-time)
 *   2. Build-time: import.meta.env.VITE_* (baked in by Vite at build)
 *   3. Defaults: hardcoded fallbacks
 *
 * This means you can deploy the same Docker image to staging and production
 * by only swapping public/config.js — no rebuild needed.
 */

interface RuntimeConfig {
  API_URL?: string;
  APP_NAME?: string;
}

declare global {
  interface Window {
    __JEWELERP_CONFIG__?: RuntimeConfig;
  }
}

function getRuntimeConfig(): RuntimeConfig {
  return window.__JEWELERP_CONFIG__ ?? {};
}

export function getConfig() {
  const runtime = getRuntimeConfig();
  return {
    apiUrl: runtime.API_URL || import.meta.env.VITE_API_URL || '/api',
    appName: runtime.APP_NAME || 'JewelERP',
  };
}
