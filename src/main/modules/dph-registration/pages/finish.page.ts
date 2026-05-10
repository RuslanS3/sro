import type { Page } from 'playwright';
import type {
  DphProtocolError,
  DphRegistrationData
} from '../dph-registration.types';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationBasePage } from './base.page';
import { DphRegistrationAutomationError } from '../errors';
import { saveDownload } from '../utils/downloads';

/**
 * "Možnosti pro ukončení" — final step (`/irs/ph1/zaver`).
 *
 * Fields:
 *   notificationEmail   input — e-mail for processing notification
 *
 * Buttons (text-only — Angular renders them without IDs):
 *   "PROTOKOL CHYB"                                                 ← opens errors dialog
 *   "Stáhnout opis v PDF - bez barevného pozadí"                    ← PDF target
 *   "Stáhnout soubor pro odeslání prostřednictvím datové schránky"  ← XML target
 *   "ODESLAT PODÁNÍ"                                                ← NEVER click
 *
 * Note: the actual portal text is "Stáhnout opis v PDF - bez barevného
 * pozadí" (without the word "úplný"), with a regular hyphen "-" — verified
 * live on adisspr.mfcr.cz.
 */
export class DphFinishPage extends DphRegistrationBasePage {
  constructor(page: Page, logger: DphRegistrationLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectUrlSlug('zaver');
  }

  /**
   * Scroll the page to the bottom so the download button block renders and
   * is interactable. The portal lays out PDF/XML buttons far below the
   * notification-email input. Without this, scrollIntoViewIfNeeded on the
   * button alone is not always enough for Angular SPA layout shifts.
   */
  async scrollToDownloads(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Give the layout a moment to settle and lazy components to mount.
    await this.page.waitForTimeout(500);
  }

  async fillNotificationEmail(data: DphRegistrationData): Promise<void> {
    if (!data.notification_email) return;
    this.logger.log('info', 'Set notification email');
    await this.fillById('notificationEmail', data.notification_email);
  }

  /**
   * Open the "PROTOKOL CHYB" dialog, read all error rows, then close it.
   * Returns a flat list of errors with severity (critical / serious / minor).
   *
   * The dialog renders three optional sections:
   *   - "Kritické chyby"          → severity: 'critical'
   *   - "Propustné závažné chyby" → severity: 'serious'
   *   - "Propustné chyby"         → severity: 'minor'
   * Each section has a table: POLOŽKA | HLÁŠENÍ | KÓD CHYBY.
   */
  async readProtocolErrors(): Promise<DphProtocolError[]> {
    this.logger.log('info', 'Open PROTOKOL CHYB dialog');
    const opened = await this.clickButtonByText('PROTOKOL CHYB', 'Protokol chyb');
    if (!opened) {
      this.logger.log('warn', 'PROTOKOL CHYB button not found — skipping protocol read');
      return [];
    }

    // Wait briefly for the dialog/overlay to render.
    await this.page.waitForTimeout(800);

    const errors = await this.page.evaluate(() => {
      const sectionMap: Array<{ titleRe: RegExp; severity: 'critical' | 'serious' | 'minor' }> = [
        { titleRe: /Kritick[eé]\s+chyby/i, severity: 'critical' },
        { titleRe: /Propustn[eé]\s+z[áa]va[žz]n[eé]\s+chyby/i, severity: 'serious' },
        { titleRe: /Propustn[eé]\s+chyby/i, severity: 'minor' }
      ];

      const out: Array<{ severity: 'critical' | 'serious' | 'minor'; field: string; message: string; code?: string }> = [];

      // The dialog uses h2/h3/strong elements as section titles. Find each
      // heading and grab the next adjacent <table>.
      const headings = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, strong, p')
      ) as HTMLElement[];

      for (const { titleRe, severity } of sectionMap) {
        const heading = headings.find((h) => titleRe.test((h.textContent || '').trim()));
        if (!heading) continue;

        // Walk forward from heading to find the closest table.
        let node: Element | null = heading;
        let table: HTMLTableElement | null = null;
        for (let hop = 0; hop < 8 && node; hop += 1) {
          if (node.tagName === 'TABLE') {
            table = node as HTMLTableElement;
            break;
          }
          const nested = node.querySelector('table');
          if (nested) {
            table = nested as HTMLTableElement;
            break;
          }
          node = node.nextElementSibling || node.parentElement?.nextElementSibling || null;
        }
        if (!table) continue;

        const rows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(
          (tr) => tr.querySelectorAll('td').length >= 2
        );
        for (const tr of rows) {
          const tds = Array.from(tr.querySelectorAll('td')).map((td) =>
            (td.textContent || '').replace(/\s+/g, ' ').trim()
          );
          if (tds.length === 0) continue;
          const [field = '', message = '', code = ''] = tds;
          if (!field && !message) continue;
          out.push({ severity, field, message, code: code || undefined });
        }
      }

      return out;
    });

    // Close the dialog (Esc + try a close button).
    await this.page.keyboard.press('Escape').catch(() => undefined);
    await this.clickButtonByText('Zavřít', 'Close', 'ZAVŘÍT').catch(() => undefined);
    await this.page.waitForTimeout(400);

    this.logger.log('info', 'Protokol chyb parsed', {
      total: errors.length,
      critical: errors.filter((e) => e.severity === 'critical').length,
      serious: errors.filter((e) => e.severity === 'serious').length,
      minor: errors.filter((e) => e.severity === 'minor').length
    });

    return errors;
  }

  /**
   * Download "Stáhnout opis v PDF - bez barevného pozadí" — the 2nd PDF
   * button on the page, the one with white background. Portal sometimes
   * renders it with the word "úplný" and sometimes without; we match both.
   */
  async downloadPdfBezPozadi(downloadDir: string): Promise<string> {
    return this.downloadByRegex(
      // Case-insensitive, "úplný" optional, hyphen variants tolerated.
      /st[áa]hnout\s+(?:[uú]pln[ýy]\s+)?opis\s+v\s+pdf\s*[-–—]\s*bez\s+barevn[eé]ho\s+pozad[ií]/i,
      downloadDir,
      'pdf',
      'PDF (bez barevného pozadí)'
    );
  }

  /**
   * Download "Stáhnout soubor pro odeslání prostřednictvím datové schránky"
   * — the last button on the page, an XML file destined for data-box.
   */
  async downloadXmlForDataBox(downloadDir: string): Promise<string> {
    return this.downloadByRegex(
      /st[áa]hnout\s+soubor\s+pro\s+odesl[áa]n[ií]\s+prost[řr]ednictv[ií]m\s+datov[eé]\s+schr[áa]nky/i,
      downloadDir,
      'xml',
      'XML (datová schránka)'
    );
  }

  /**
   * Click any visible <button> matching the given pattern (against
   * aria-label OR textContent — whichever is set), waiting for a download
   * event. Returns the saved file path.
   *
   * Why two attribute checks? The portal renders the same button in two
   * places at /zaver — once as `<button class="user-link">` with only
   * textContent, and once as a styled `<button id="btn-..." aria-label="...">`
   * with both. We want to find either.
   */
  private async downloadByRegex(
    pattern: RegExp,
    downloadDir: string,
    forcedExt: string,
    label: string
  ): Promise<string> {
    this.logger.log('info', `Trigger download: ${label}`, { pattern: pattern.source });

    // Always scroll to bottom first — download buttons live below the fold.
    await this.page
      .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      .catch(() => undefined);
    await this.page.waitForTimeout(300);

    // Prefer the visible main-content button (class "user-link") over the
    // hidden dropdown variant (class "dropdown-item"). The portal renders
    // the same action in both places; clicking the dropdown one while the
    // dropdown is closed is a no-op.
    const buttonHandle = await this.page.evaluateHandle((re) => {
      const all = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      const reAct = new RegExp(re.source, re.flags);
      const matches = (b: HTMLButtonElement): boolean => {
        const aria = (b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        const text = (b.textContent || '').replace(/\s+/g, ' ').trim();
        return reAct.test(aria) || reAct.test(text);
      };
      const isVisible = (b: HTMLButtonElement): boolean =>
        b.offsetParent !== null && !b.disabled;
      const candidates = all.filter(matches);

      // 1. Visible main-content "user-link" button.
      const userLink = candidates.find(
        (b) => b.classList.contains('user-link') && isVisible(b)
      );
      if (userLink) return userLink;

      // 2. Any styled "btn-secondary-2" (some forms render PDF/XML as primary buttons).
      const styled = candidates.find(
        (b) => b.classList.contains('btn-secondary-2') && isVisible(b)
      );
      if (styled) return styled;

      // 3. Any visible match.
      const anyVisible = candidates.find(isVisible);
      if (anyVisible) return anyVisible;

      // 4. Last resort — any match (even hidden, e.g. dropdown-item).
      return candidates[0] ?? null;
    }, { source: pattern.source, flags: pattern.flags });

    const buttonElement = buttonHandle.asElement();
    if (!buttonElement) {
      await buttonHandle.dispose();
      throw new DphRegistrationAutomationError(
        `${label} download button was not found.`,
        { url: this.page.url(), pageTitle: await this.page.title() }
      );
    }

    // Log which exact button we found for debugging.
    const buttonInfo = await buttonElement.evaluate((b) => ({
      id: (b as HTMLElement).id || '',
      cls: ((b as HTMLElement).className || '').toString(),
      aria: (b as HTMLElement).getAttribute('aria-label') || '',
      text: ((b as HTMLElement).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    })).catch(() => ({ id: '', cls: '', aria: '', text: '' }));
    this.logger.log('info', 'Found download button', { label, ...buttonInfo });

    try {
      await buttonElement.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);

      // The click might trigger a download on:
      //   (a) the current page (most common — Angular fetch+blob),
      //   (b) a new tab/window (if the portal uses window.open),
      //   (c) a navigation that the browser turns into a download.
      // Listen for downloads on the context level (catches both main page and
      // any new pages) and race against a timeout.
      const context = this.page.context();
      const collectedFromNewPages: Promise<import('playwright').Download>[] = [];
      const onPage = (newPage: import('playwright').Page): void => {
        collectedFromNewPages.push(
          newPage
            .waitForEvent('download', { timeout: 30_000 })
            .then((d) => {
              this.logger.log('info', 'Download event from new page', {
                url: newPage.url()
              });
              return d;
            })
        );
      };
      context.on('page', onPage);

      try {
        const downloadFromCurrent = this.page.waitForEvent('download', {
          timeout: 30_000
        });
        await buttonElement.click({ force: true });

        // Race: download on current page OR any new page.
        const download = await Promise.race<import('playwright').Download>([
          downloadFromCurrent,
          new Promise<import('playwright').Download>((resolve, reject) => {
            const interval = setInterval(() => {
              if (collectedFromNewPages.length > 0) {
                clearInterval(interval);
                Promise.race(collectedFromNewPages).then(resolve, reject);
              }
            }, 100);
            setTimeout(() => {
              clearInterval(interval);
              reject(new Error('No download event from new pages within 30s'));
            }, 30_000);
          })
        ]);

        return saveDownload(download, downloadDir, forcedExt);
      } finally {
        context.off('page', onPage);
      }
    } catch (e) {
      throw new DphRegistrationAutomationError(
        `${label} click did not trigger a download: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { url: this.page.url(), pageTitle: await this.page.title() }
      );
    } finally {
      await buttonHandle.dispose();
    }
  }
}
