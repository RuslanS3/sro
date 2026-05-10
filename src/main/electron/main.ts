import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'node:fs';
import { registerIpcHandlers } from './ipc';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

/**
 * Tell Playwright to find its browser binaries inside the bundle, not in
 * the user's global cache. The packaged build runs `playwright install`
 * with PLAYWRIGHT_BROWSERS_PATH=0, which puts Chromium into
 * `node_modules/playwright-core/.local-browsers/`. Setting the env var to
 * "0" at runtime makes Playwright look there as well.
 *
 * In dev we leave this unset so Playwright uses the developer's normal
 * cache (`~/Library/Caches/ms-playwright`).
 */
if (!isDev) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

  // Some packaged Electron apps run with cwd=/, which breaks relative paths
  // Playwright might use. Anchor cwd to app resources so binary lookup works.
  try {
    const resourcesPath = path.join(app.getAppPath(), '..');
    if (fs.existsSync(resourcesPath)) {
      process.chdir(resourcesPath);
    }
  } catch {
    // Best-effort.
  }
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 980,
    minHeight: 700,
    title: 'Office Automation',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  const window = createMainWindow();
  registerIpcHandlers(window);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow();
      registerIpcHandlers(win);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
