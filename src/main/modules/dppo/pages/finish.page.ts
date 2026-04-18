import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { DppoAutomationError } from '../errors';
import { ensureDir, saveDownloadTo } from '../utils/downloads';
import { dismissCookieBanner } from '../utils/epo-ui';

export type ProtocolErrorRow = {
  linkId?: string;
  message: string;
};

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

  async ensureOnFinishOrProtocol(): Promise<void> {
    const title = await this.page.title().catch(() => '');
    if (title.includes('Závěr - Přihláška k registraci pro právnické osoby')) {
      return;
    }

    if (title.includes('Protokol chyb - Přihláška k registraci pro právnické osoby')) {
      return;
    }

    throw new DppoAutomationError('Expected to be on Závěr or Protokol chyb page.', {
      url: this.page.url(),
      pageTitle: title
    });
  }

  async validateProtocol(): Promise<void> {
    this.logger.log('info', 'Run protocol check on final page');
    await this.safeClickByValue('Protokol chyb');
    await this.page.waitForLoadState('domcontentloaded');
    await this.expectTitleContains('Protokol chyb - Přihláška k registraci pro právnické osoby');

    const bodyText = (await this.page.textContent('body'))?.replace(/\s+/g, ' ').trim() ?? '';
    const hasCriticalErrors = /Nalezen[eé]\s+kritick[eé]\s+chyby/i.test(bodyText);

    if (hasCriticalErrors) {
      const marker = bodyText.match(/Nalezen[eé]\s+kritick[eé]\s+chyby[\s\S]{0,900}/i)?.[0] ?? 'Critical protocol errors detected.';
      throw new DppoAutomationError(`Protocol contains critical errors: ${marker}`, {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }

    const backButton = this.page.locator('input[type="submit"][value="Zpět"]').first();
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.expectTitleContains('Závěr - Přihláška k registraci pro právnické osoby');
    }
  }

  async readProtocol(): Promise<{ hasCriticalErrors: boolean; bodyText: string; criticalErrorLinkIds: string[]; criticalErrors: ProtocolErrorRow[] }> {
    this.logger.log('info', 'Run protocol check on final page');
    const currentTitle = await this.page.title().catch(() => '');
    if (!currentTitle.includes('Protokol chyb - Přihláška k registraci pro právnické osoby')) {
      await this.safeClickByValue('Protokol chyb');
      await this.page.waitForLoadState('domcontentloaded');
      await this.expectTitleContains('Protokol chyb - Přihláška k registraci pro právnické osoby');
    }

    const protocolData = await this.page.evaluate(() => {
      const bodyText = (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
      const errorAnchors = Array.from(document.querySelectorAll('a[id^="frm:kritickeT:"]'))
        .filter((anchor) => (anchor.textContent ?? '').trim().length > 0);
      const criticalErrorLinkIds = Array.from(document.querySelectorAll('a[id^="frm:kritickeT:"]'))
        .filter((anchor) => (anchor.textContent ?? '').trim().length > 0)
        .map((anchor) => anchor.id);

      const criticalErrors: Array<{ linkId?: string; message: string }> = errorAnchors.map((anchor) => ({
        linkId: anchor.id,
        message: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim()
      }));

      const tableRows = Array.from(document.querySelectorAll('table tr'));
      for (const row of tableRows as HTMLTableRowElement[]) {
        const rowText = (row.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!rowText) {
          continue;
        }
        if (!/mus[ií]\s+b[ýy]t\s+vypln[ěe]no/i.test(rowText)) {
          continue;
        }
        if (criticalErrors.some((item) => item.message === rowText)) {
          continue;
        }
        criticalErrors.push({ linkId: undefined, message: rowText });
      }

      const hasCriticalErrors = /Nalezen[eé]\s+kritick[eé]\s+chyby/i.test(bodyText);
      return { bodyText, hasCriticalErrors, criticalErrorLinkIds, criticalErrors };
    });

    return protocolData;
  }

  async goBackFromProtocolToFinish(): Promise<void> {
    const backButton = this.page.locator('input[type="submit"][value="Zpět"]').first();
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.expectTitleContains('Závěr - Přihláška k registraci pro právnické osoby');
      return;
    }

    const finishLink = this.page.getByRole('link', { name: 'Závěr', exact: true }).first();
    if (await finishLink.isVisible().catch(() => false)) {
      await finishLink.click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.expectTitleContains('Závěr - Přihláška k registraci pro právnické osoby');
    }
  }

  async clickCriticalError(error: ProtocolErrorRow): Promise<boolean> {
    await dismissCookieBanner(this.page);
    const beforeUrl = this.page.url();
    const beforeTitle = await this.page.title().catch(() => '');
    const waitForTransition = async (): Promise<boolean> => {
      await this.page
        .waitForFunction(
          (prev) => {
            const hasRepresentativeInput = !!document.getElementById('frm:s_zast_prijmeni:i_vstup:zast_prijmeni');
            return (
              window.location.href !== prev.url ||
              document.title !== prev.title ||
              hasRepresentativeInput
            );
          },
          { url: beforeUrl, title: beforeTitle },
          { timeout: 6_000 }
        )
        .catch(() => undefined);

      const afterUrl = this.page.url();
      const afterTitle = await this.page.title().catch(() => '');
      const hasRepresentativeInput = await this.page
        .locator('#frm\\:s_zast_prijmeni\\:i_vstup\\:zast_prijmeni')
        .first()
        .isVisible()
        .catch(() => false);

      return afterUrl !== beforeUrl || afterTitle !== beforeTitle || hasRepresentativeInput;
    };

    if (error.linkId) {
      const safeId = error.linkId.replace(/"/g, '\\"');
      const byId = this.page.locator(`[id="${safeId}"]`).first();
      if (await byId.isVisible().catch(() => false)) {
        await byId.click({ force: true }).catch(() => undefined);
        if (await waitForTransition()) {
          return true;
        }
      }

      // JSF fallback: trigger the exact form submit command used by onclick="oamSubmitForm('frm','<linkId>')"
      await this.page
        .evaluate((linkId) => {
          const w = window as unknown as { oamSubmitForm?: (formId: string, command: string) => boolean };
          if (typeof w.oamSubmitForm === 'function') {
            w.oamSubmitForm('frm', linkId);
          }
        }, error.linkId)
        .catch(() => undefined);
      if (await waitForTransition()) {
        return true;
      }
    }

    if (this.page.url() === beforeUrl && (await this.page.title().catch(() => '')) === beforeTitle) {
      const row = this.page.locator('tr', { hasText: error.message }).first();
      if (await row.isVisible().catch(() => false)) {
        await row.click({ force: true }).catch(() => undefined);
        if (await waitForTransition()) {
          return true;
        }
      }
    }

    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await this.page.waitForTimeout(350);
    const afterUrl = this.page.url();
    const afterTitle = await this.page.title().catch(() => '');

    return afterUrl !== beforeUrl || afterTitle !== beforeTitle;
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
