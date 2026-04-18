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
import { TaxRegistrationPage } from './pages/tax-registration.page';
import { dismissCookieBanner } from './utils/epo-ui';

function sanitizeFolderName(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function defaultDownloadDir(payload: DppoPayload): string {
  const folderName = sanitizeFolderName(payload.data.company_name || payload.data.ico || 'unknown');
  return path.join(os.homedir(), 'Downloads', 'xml', folderName);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function navigateToSection(page: import('playwright').Page, sectionName: string): Promise<void> {
  await dismissCookieBanner(page);
  await page.getByRole('link', { name: sectionName, exact: true }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

async function recoverFromProtocolErrors(
  page: import('playwright').Page,
  payload: DppoPayload,
  logger: DppoLogger
): Promise<void> {
  const finishPage = new FinishPage(page, page.context(), logger);
  const headerPage = new HeaderPage(page, logger);
  const taxSubjectPage = new TaxSubjectPage(page, logger);
  const taxRegistrationPage = new TaxRegistrationPage(page, logger);

  const applyFixOnCurrentPage = async (): Promise<boolean> => {
    const title = (await page.title()).toLowerCase();

    if (title.includes('záhlaví')) {
      await headerPage.assertLoaded();
      await headerPage.fill(payload);
      return true;
    }

    if (title.includes('daňový subjekt')) {
      await taxSubjectPage.assertLoaded();
      await taxSubjectPage.fillCriticalFields(payload);
      return true;
    }

    if (title.includes('daňová registrace')) {
      await taxRegistrationPage.assertLoaded();
      await taxRegistrationPage.fill(payload);
      return true;
    }

    return false;
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await finishPage.ensureOnFinishOrProtocol();
    const protocol = await finishPage.readProtocol();

    if (!protocol.hasCriticalErrors) {
      await finishPage.goBackFromProtocolToFinish();
      return;
    }

    const body = protocol.bodyText.toLowerCase();
    logger.log('warn', 'Protocol has critical errors, attempting auto-recovery', { attempt });

    let appliedAnyFix = false;

    for (const criticalError of protocol.criticalErrors) {
      const navigated = await finishPage.clickCriticalError(criticalError);
      if (!navigated) {
        continue;
      }

      const appliedByClick = await applyFixOnCurrentPage();
      appliedAnyFix = appliedAnyFix || appliedByClick;
      await page.waitForTimeout(500);
      await navigateToSection(page, 'Závěr');
      await finishPage.assertLoaded();
    }

    if (/finan[cč]n[ií]ho [úu][řr]adu|c[ií]lov[ée]ho finan[cč]n[ií]ho [úu][řr]adu/.test(body)) {
      await navigateToSection(page, 'Záhlaví');
      await headerPage.assertLoaded();
      await headerPage.fill(payload);
      appliedAnyFix = true;
    }

    if (/obchodn[ií] jm[eé]no|n[aá]zev pr[aá]vnick[eé] osoby|p[řr][ií]jmen[ií] z[aá]stupce|jm[eé]no z[aá]stupce|datum narozen[ií]/.test(body)) {
      await navigateToSection(page, 'Daňový subjekt');
      await taxSubjectPage.assertLoaded();
      await taxSubjectPage.fillCriticalFields(payload);
      await page.waitForTimeout(500);
      appliedAnyFix = true;
    }

    if (/\\bk[čc]\\b|da[nň]ov[aá] registrace/.test(body)) {
      await navigateToSection(page, 'Daňová registrace');
      await taxRegistrationPage.assertLoaded();
      await taxRegistrationPage.fill(payload);
      appliedAnyFix = true;
    }

    if (!appliedAnyFix) {
      throw new DppoAutomationError('Protocol has critical errors that cannot be auto-recovered by current rules.', {
        url: page.url(),
        pageTitle: await page.title()
      });
    }

    await navigateToSection(page, 'Závěr');
  }

  throw new DppoAutomationError('Auto-recovery attempts exceeded. Protocol still contains critical errors.', {
    url: page.url(),
    pageTitle: await page.title()
  });
}

export async function generateDppoXml(
  payload: DppoPayload,
  options: GenerateDppoXmlOptions = {},
  logger: DppoLogger = new ConsoleDppoLogger()
): Promise<GenerateDppoXmlResult> {
  if (!payload.data.signatory_first_name?.trim() || !payload.data.signatory_last_name?.trim()) {
    return {
      status: 'error',
      message: 'Representative first name and last name are required for EPO (Daňový subjekt).'
    };
  }

  const downloadDir = options.downloadDir ?? defaultDownloadDir(payload);
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

    const taxRegistrationPage = new TaxRegistrationPage(page, logger);
    await taxRegistrationPage.assertLoaded();
    await taxRegistrationPage.fill(payload);
    await taxRegistrationPage.next();

    const branchAppendixPage = new GenericNextPage(page, logger, 'Příloha - Organizační složky obchodního závodu');
    await branchAppendixPage.assertLoaded();
    await branchAppendixPage.next();

    const otherAppendixPage = new GenericNextPage(page, logger, 'Jiné přílohy');
    await otherAppendixPage.assertLoaded();
    await otherAppendixPage.next();

    const finishPage = new FinishPage(page, context, logger);
    await finishPage.assertLoaded();
    await recoverFromProtocolErrors(page, payload, logger);
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
