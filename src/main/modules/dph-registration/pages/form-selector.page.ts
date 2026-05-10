import type { Page } from 'playwright';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationAutomationError } from '../errors';
import { dismissCookieBanner } from '../utils/epo-ui';

/**
 * Direct deep-link to a fresh "Přihláška k registraci k dani z přidané hodnoty
 * platná od 1.1.2015" form.
 *
 * Form code is `IRS_PH1` (with underscore). The portal redirects this URL
 * to `pmd/epo/podani/<sessionId>/irs/ph1/uvod` (intro page). From there the
 * user clicks "VSTOUPIT DO FORMULÁŘE" to enter the actual form, landing on
 * `/irs/ph1/zahlavi`.
 *
 * Verified live by walking the portal:
 *   pmd/home → Elektronická podání → Elektronické formuláře →
 *   accordion "Registrace" → "Přihláška k registraci k dani z přidané hodnoty
 *   platná od 1.1.2015" links to /pmd/epo/novy/IRS_PH1.
 */
const DIRECT_FORM_URL = 'https://adisspr.mfcr.cz/pmd/epo/novy/IRS_PH1';

const SESSION_URL_RE = /adisspr\.mfcr\.cz\/pmd\/epo\/podani\//;

export class DphFormSelectorPage {
  constructor(
    private readonly page: Page,
    private readonly logger: DphRegistrationLogger
  ) {}

  async openAndSelectForm(): Promise<void> {
    this.logger.log('info', 'Open VAT registration form (direct deep-link)', {
      url: DIRECT_FORM_URL
    });
    await this.page.goto(DIRECT_FORM_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000
    });

    // Deep-link redirects to a session URL ending in /irs/ph1/uvod.
    await this.page
      .waitForURL(SESSION_URL_RE, { timeout: 20_000 })
      .catch(() => undefined);

    if (!SESSION_URL_RE.test(this.page.url())) {
      throw new DphRegistrationAutomationError(
        'Failed to open VAT registration form (IRS_PH1) — no session URL.',
        {
          url: this.page.url(),
          pageTitle: await this.page.title().catch(() => undefined)
        }
      );
    }

    // Dismiss the cookie banner BEFORE clicking VSTOUPIT — otherwise the
    // banner sits on top and intercepts clicks.
    await dismissCookieBanner(this.page);

    // If we landed on /uvod (intro), click "VSTOUPIT DO FORMULÁŘE" to enter
    // the actual form. This advances the route to /irs/ph1/zahlavi.
    if (/\/irs\/ph1\/uvod/.test(this.page.url())) {
      this.logger.log('info', 'On /uvod — clicking VSTOUPIT DO FORMULÁŘE');
      const enter = this.page
        .locator('button:has-text("VSTOUPIT DO FORMULÁŘE")')
        .first();
      if (await enter.isVisible().catch(() => false)) {
        await enter.click({ force: true });
      }
      await this.page
        .waitForURL(/\/irs\/ph1\/zahlavi/, { timeout: 20_000 })
        .catch(() => undefined);
    }

    if (!/\/irs\/ph1\/zahlavi/.test(this.page.url())) {
      throw new DphRegistrationAutomationError(
        'Failed to enter form Záhlaví page from intro.',
        {
          url: this.page.url(),
          pageTitle: await this.page.title().catch(() => undefined)
        }
      );
    }

    // After entering, dismiss again (Angular re-renders banner sometimes).
    await dismissCookieBanner(this.page);
  }
}
