import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { DppoAutomationError } from '../errors';
import { ensureDir, saveDownloadTo } from '../utils/downloads';

export class FinishPage extends DppoBasePage {
  constructor(
    page: Page,
    private readonly context: BrowserContext,
    logger: DppoLogger
  ) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Závěr - Přihláška k registraci pro právnické osoby');
  }

  async exportXml(downloadDir: string): Promise<string> {
    this.logger.log('info', 'Open save page from final step');
    await this.safeClickByValue('Uložení prac. souboru');
    await this.page.waitForLoadState('domcontentloaded');
    await this.expectTitleContains('Uložení pracovní verze písemnosti');

    this.logger.log('info', 'Trigger XML download');
    try {
      const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: 20_000 }),
        this.page.locator('input[type="submit"][value="Uložit na PC"]').first().click()
      ]);

      const filePath = await saveDownloadTo(download, downloadDir);
      return filePath;
    } catch {
      this.logger.log('warn', 'Direct download did not fire, trying XML link fallback');

      const href = await this.page.locator('a[href*=".xml"]').first().getAttribute('href');
      if (!href) {
        throw new DppoAutomationError('XML link was not found on save page.', {
          url: this.page.url(),
          pageTitle: await this.page.title()
        });
      }

      const absoluteUrl = new URL(href, this.page.url()).toString();
      const response = await this.context.request.get(absoluteUrl, { timeout: 30_000 });
      if (!response.ok()) {
        throw new DppoAutomationError('Failed to download XML from fallback link.', {
          url: absoluteUrl,
          pageTitle: await this.page.title()
        });
      }

      const body = await response.text();
      ensureDir(downloadDir);
      const fileName = path.basename(new URL(absoluteUrl).pathname) || `dppo-${Date.now()}.xml`;
      const filePath = path.join(downloadDir, fileName.endsWith('.xml') ? fileName : `${fileName}.xml`);
      await fs.writeFile(filePath, body, 'utf8');
      return filePath;
    }
  }
}
