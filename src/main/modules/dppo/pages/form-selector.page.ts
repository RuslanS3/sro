import type { Page } from 'playwright';
import type { DppoLogger } from '../logger';

const START_URL = 'https://adisspr.mfcr.cz/dpr/adis/idpr_epo/epo2/form/form_uvod.faces';

export class FormSelectorPage {
  constructor(
    private readonly page: Page,
    private readonly logger: DppoLogger
  ) {}

  async openAndSelectForm(): Promise<void> {
    this.logger.log('info', 'Open EPO start page', { url: START_URL });
    await this.page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const registrationButton = this.page.getByRole('button', { name: 'Registrace', exact: true }).first();
    if (await registrationButton.isVisible().catch(() => false)) {
      await registrationButton.click();
    }

    this.logger.log('info', 'Select registration form IRS_RPO');
    const formLink = this.page.getByRole('link', { name: 'Přihláška k registraci pro právnické osoby', exact: true }).first();
    if (await formLink.isVisible().catch(() => false)) {
      await formLink.click();
      await this.page.waitForLoadState('domcontentloaded');
      return;
    }

    this.logger.log('warn', 'Form link is not visible in list, fallback to direct form URL');
    await this.page.goto('https://adisspr.mfcr.cz/pmd/epo/novy/IRS_RPO', {
      waitUntil: 'domcontentloaded',
      timeout: 120_000
    });
  }
}
