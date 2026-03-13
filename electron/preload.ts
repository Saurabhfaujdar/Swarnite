/**
 * JewelERP — Thin Wrapper Preload
 * ────────────────────────────────
 * Minimal preload for the wrapper. Exposes only a platform
 * identifier so the web app can detect it's running inside
 * the desktop wrapper (e.g., to hide "Install App" prompts).
 *
 * No IPC channels, no business logic, no navigation control.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('jewelerpDesktop', {
  platform: process.platform,  // 'win32' | 'darwin' | 'linux'
});
