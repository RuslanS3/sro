import fs from 'node:fs';
import path from 'node:path';
import type { Download } from 'playwright';

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function saveDownloadTo(download: Download, downloadDir: string): Promise<string> {
  ensureDir(downloadDir);

  const suggested = download.suggestedFilename();
  const fileName = suggested.endsWith('.xml') ? suggested : `${suggested}.xml`;
  const targetPath = path.join(downloadDir, fileName);
  await download.saveAs(targetPath);

  return targetPath;
}
