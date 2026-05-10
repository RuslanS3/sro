import fs from 'node:fs';
import path from 'node:path';
import type { Download } from 'playwright';

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Save a Playwright download to a directory, preserving the suggested filename.
 * If the suggested filename has no extension, append `forcedExtension` (no leading dot needed).
 */
export async function saveDownload(
  download: Download,
  downloadDir: string,
  forcedExtension?: string
): Promise<string> {
  ensureDir(downloadDir);

  const suggested = download.suggestedFilename();
  const hasExt = /\.[a-z0-9]+$/i.test(suggested);
  const ext = forcedExtension ? `.${forcedExtension.replace(/^\./, '')}` : '';
  const fileName = hasExt ? suggested : `${suggested}${ext}`;
  const targetPath = path.join(downloadDir, fileName);
  await download.saveAs(targetPath);
  return targetPath;
}
