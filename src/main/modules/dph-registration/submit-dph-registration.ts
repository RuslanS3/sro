import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import type {
  DphRegistrationPayload,
  GenerateDphRegistrationOptions,
  GenerateDphRegistrationResult
} from './dph-registration.types';
import type { DphRegistrationLogger } from './logger';
import { ConsoleDphRegistrationLogger } from './logger';
import { DphRegistrationAutomationError } from './errors';
import { ensureDir } from './utils/downloads';
import { dismissCookieBanner } from './utils/epo-ui';
import { DphFormSelectorPage } from './pages/form-selector.page';
import { DphHeaderPage } from './pages/header.page';
import { DphRegistrationDataPage } from './pages/registration-data.page';
import { DphBankAccountsPage } from './pages/bank-accounts.page';
import { DphAttachmentsSignaturePage } from './pages/attachments-signature.page';
import { DphFinishPage } from './pages/finish.page';

function sanitizeFolderName(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function defaultDownloadDir(payload: DphRegistrationPayload): string {
  const folderName = sanitizeFolderName(
    payload.data.company_name ||
      payload.data.fo_last_name ||
      payload.data.dic ||
      'unknown'
  );
  return path.join(os.homedir(), 'Downloads', 'dph', folderName);
}

/**
 * End-to-end VAT (DPH) registration form pipeline on the MOJE daně portal.
 *
 * Steps (URL slugs verified live):
 *  1. Open form via deep-link  → /irs/ph1/uvod → VSTOUPIT → /irs/ph1/zahlavi
 *  2. Fill Záhlaví, Plátce      → DALŠÍ STRÁNKA → /reg_udaje
 *  3. Fill Registrační údaje    → DALŠÍ STRÁNKA → /ucty
 *  4. Fill Bankovní účty + 11a  → DALŠÍ STRÁNKA → /prilohy
 *  5. Fill Jiné přílohy + Podpis (we navigate to /zaver via direct URL)
 *  6. Možnosti pro ukončení     → download PDF + XML
 *
 * Returns paths to both downloaded artifacts. Never clicks "ODESLAT PODÁNÍ".
 */
export async function generateDphRegistration(
  payload: DphRegistrationPayload,
  options: GenerateDphRegistrationOptions = {},
  logger: DphRegistrationLogger = new ConsoleDphRegistrationLogger()
): Promise<GenerateDphRegistrationResult> {
  const data = payload.data;

  if (
    !data.signature.authorized_first_name?.trim() ||
    !data.signature.authorized_last_name?.trim()
  ) {
    return {
      status: 'error',
      message:
        'Authorized signer first/last name is required (Fyzická osoba oprávněná k podpisu).'
    };
  }
  if (data.subject_type === 'P' && !data.company_name?.trim()) {
    return {
      status: 'error',
      message:
        'Company name (Obchodní jméno právnické osoby) is required for legal entities.'
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
    logger.log('info', 'Start DPH registration flow', { route: payload.route });

    const selectorPage = new DphFormSelectorPage(page, logger);
    await selectorPage.openAndSelectForm();
    await dismissCookieBanner(page);

    // Step 1: Záhlaví, Plátce
    const headerPage = new DphHeaderPage(page, logger);
    await headerPage.assertLoaded();
    await headerPage.fill(data);
    await headerPage.next('zahlavi');

    // Step 2: Registrační údaje
    const regDataPage = new DphRegistrationDataPage(page, logger);
    await regDataPage.assertLoaded();
    await regDataPage.fill(data);
    await regDataPage.next('reg_udaje');

    // Step 3: Bankovní účty
    const banksPage = new DphBankAccountsPage(page, logger);
    await banksPage.assertLoaded();
    await banksPage.fill(data);
    await banksPage.next('ucty');

    // Step 4: Jiné přílohy + Podpis
    const attachmentsPage = new DphAttachmentsSignaturePage(page, logger);
    await attachmentsPage.assertLoaded();
    await attachmentsPage.fill(data);

    // Step 5: SPA-navigate to Závěr. Prefer clicking "DALŠÍ STRÁNKA >" —
    // that triggers Angular's normal route handler and commits all form
    // state from /prilohy. If no next button is present, fall back to a
    // direct URL replace.
    logger.log('info', 'Navigate to Závěr');
    const beforeSlug = page.url().match(/\/irs\/ph1\/([^?#/]+)/)?.[1] ?? 'prilohy';
    const nextBtn = page.locator('button:has-text("DALŠÍ STRÁNKA")').first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click({ force: true }).catch(() => undefined);
      await page
        .waitForFunction(
          (slug) => !location.pathname.endsWith('/' + slug),
          beforeSlug,
          { timeout: 20_000 }
        )
        .catch(() => undefined);
      await page.waitForTimeout(500);
    }

    if (!/\/irs\/ph1\/zaver/.test(page.url())) {
      // Fallback: direct URL navigation.
      const zaverUrl = page.url().replace(/\/irs\/ph1\/[^?#/]+/, '/irs/ph1/zaver');
      logger.log('info', 'Falling back to direct goto for Závěr', { url: zaverUrl });
      await page.goto(zaverUrl, { waitUntil: 'domcontentloaded' });
    }

    const finishPage = new DphFinishPage(page, logger);
    await finishPage.assertLoaded();
    await finishPage.fillNotificationEmail(data);

    // Scroll to the bottom of /zaver so the download button block becomes
    // visible and lazy components mount. The PDF/XML buttons live below the
    // notification email input.
    await finishPage.scrollToDownloads();

    // Step 6: download the two artifacts directly. The user explicitly does
    // NOT want us to click "PROTOKOL CHYB" — just produce the files.
    //   - 2nd download button: "Stáhnout opis v PDF - bez barevného pozadí"
    //   - last download button: "Stáhnout soubor pro odeslání prostřednictvím datové schránky"
    const pdfFilePath = await finishPage.downloadPdfBezPozadi(downloadDir);
    logger.log('info', 'PDF saved', { pdfFilePath });

    const xmlFilePath = await finishPage.downloadXmlForDataBox(downloadDir);
    logger.log('info', 'XML saved', { xmlFilePath });

    return {
      status: 'success',
      pdfFilePath,
      xmlFilePath
    };
  } catch (error) {
    const screenshotPath = path.join(downloadDir, `dph-failure-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

    const pageTitle = await page.title().catch(() => undefined);
    const url = page.url();

    logger.log('error', 'DPH registration flow failed', {
      message: error instanceof Error ? error.message : String(error),
      url,
      pageTitle,
      screenshotPath
    });

    const message =
      error instanceof DphRegistrationAutomationError
        ? error.message
        : 'Failed to complete VAT registration form.';

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
