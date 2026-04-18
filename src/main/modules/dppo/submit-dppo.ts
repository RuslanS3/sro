import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import type { GenerateDppoXmlOptions, GenerateDppoXmlResult, DppoPayload } from './types';
import type { DppoLogger } from './logger';
import { ConsoleDppoLogger } from './logger';
import { FormSelectorPage } from './pages/form-selector.page';
import { IntroPage } from './pages/intro.page';
import { HeaderPage } from './pages/header.page';
import { TaxSubjectPage } from './pages/tax-subject.page';
import { BusinessActivityPage } from './pages/business-activity.page';
import { OrganizationalUnitsPage } from './pages/organizational-units.page';
import { GenericNextPage } from './pages/generic-next.page';
import { FinishPage } from './pages/finish.page';
import { DppoAutomationError } from './errors';

async function dismissCookieBanner(page: import('playwright').Page): Promise<void> {
  const consentButton = page.locator('input[type="submit"][value="Souhlas se všemi"]').first();
  if (await consentButton.isVisible().catch(() => false)) {
    await consentButton.click().catch(() => undefined);
    await page.waitForTimeout(200);
  }
}

function defaultDownloadDir(): string {
  return path.join(os.homedir(), 'Public', 'Varv', 'dppo-xml');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function generateDppoXml(
  payload: DppoPayload,
  options: GenerateDppoXmlOptions = {},
  logger: DppoLogger = new ConsoleDppoLogger()
): Promise<GenerateDppoXmlResult> {
  const downloadDir = options.downloadDir ?? defaultDownloadDir();
  ensureDir(downloadDir);

  const browser = await chromium.launch({
    headless: options.headless ?? true,
    slowMo: options.slowMo
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'cs-CZ'
  });

  const page = await context.newPage();

  try {
    logger.log('info', 'Start DPPO XML generation flow', { route: payload.route });

    const selectorPage = new FormSelectorPage(page, logger);
    await selectorPage.openAndSelectForm();
    await dismissCookieBanner(page);

    const introPage = new IntroPage(page, logger);
    await introPage.assertLoaded();
    await introPage.next();

    const headerPage = new HeaderPage(page, logger);
    await headerPage.assertLoaded();
    await headerPage.fill(payload);
    await headerPage.next();

    const taxSubjectPage = new TaxSubjectPage(page, logger);
    await taxSubjectPage.assertLoaded();
    await taxSubjectPage.fill(payload);
    await taxSubjectPage.next();

    const businessActivityPage = new BusinessActivityPage(page, logger);
    await businessActivityPage.assertLoaded();
    await businessActivityPage.fill(payload);
    await businessActivityPage.next();

    const organizationalUnitsPage = new OrganizationalUnitsPage(page, logger);
    await organizationalUnitsPage.assertLoaded();
    await organizationalUnitsPage.fill(payload);
    await organizationalUnitsPage.next();

    const bankAccountsPage = new GenericNextPage(page, logger, 'Bankovní účty');
    await bankAccountsPage.assertLoaded();
    await bankAccountsPage.next();

    const additionalInfoPage = new GenericNextPage(page, logger, 'Doplňující informace');
    await additionalInfoPage.assertLoaded();
    await additionalInfoPage.next();

    const taxRegistrationPage = new GenericNextPage(page, logger, 'Daňová registrace');
    await taxRegistrationPage.assertLoaded();
    await taxRegistrationPage.next();

    const branchAppendixPage = new GenericNextPage(page, logger, 'Příloha - Organizační složky obchodního závodu');
    await branchAppendixPage.assertLoaded();
    await branchAppendixPage.next();

    const otherAppendixPage = new GenericNextPage(page, logger, 'Jiné přílohy');
    await otherAppendixPage.assertLoaded();
    await otherAppendixPage.next();

    const finishPage = new FinishPage(page, context, logger);
    await finishPage.assertLoaded();
    const xmlFilePath = await finishPage.exportXml(downloadDir);

    logger.log('info', 'DPPO XML generation finished', { xmlFilePath });

    return {
      status: 'success',
      xmlFilePath
    };
  } catch (error) {
    const screenshotPath = path.join(downloadDir, `dppo-failure-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

    const pageTitle = await page.title().catch(() => undefined);
    const url = page.url();

    logger.log('error', 'DPPO XML generation failed', {
      message: error instanceof Error ? error.message : String(error),
      url,
      pageTitle,
      screenshotPath
    });

    const message =
      error instanceof DppoAutomationError
        ? error.message
        : 'Failed to generate XML for DPPO flow.';

    return {
      status: 'error',
      message,
      screenshotPath
    };
  } finally {
    if (options.keepBrowserOpen) {
      logger.log('info', 'Browser is kept open by option keepBrowserOpen=true');
    } else {
      await context.close();
      await browser.close();
    }
  }
}
