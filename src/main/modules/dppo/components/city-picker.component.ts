import type { Page } from 'playwright';
import type { DppoLogger } from '../logger';
import { DppoAutomationError } from '../errors';

export class CityPickerComponent {
  constructor(
    private readonly page: Page,
    private readonly logger: DppoLogger
  ) {}

  async pickCity(cityInput: string, zip?: string): Promise<void> {
    this.logger.log('info', 'Open city picker', { cityInput, zip });
    await this.page.locator('input[id$="s_naz_obce:i_ciselnik:naz_obce_tl"]').first().click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForFunction(() => document.title.includes('Výběr z číselníku'), undefined, { timeout: 20_000 });

    const filter = this.page.locator('#frm\\:iFiltr');
    await filter.fill(cityInput);
    await this.page.locator('#vyhledat').click();
    await this.page.waitForLoadState('domcontentloaded');

    const normalizedCity = cityInput.trim().toUpperCase();
    const cityRowCandidates = this.page.locator('a[id^="frm\\:select\\:"]');

    let row = cityRowCandidates.filter({ hasText: normalizedCity });
    if (zip) {
      const zipped = cityRowCandidates.filter({ hasText: `${normalizedCity} (PSČ: ${zip})` });
      if (await zipped.count()) {
        row = zipped;
      }
    }

    if (!(await row.count())) {
      throw new DppoAutomationError('City was not found in EPO city picker.', {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }

    await row.first().click();
    await this.page.locator('#frm\\:vybrat').click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForFunction(() => document.title.includes('Daňový subjekt'), undefined, { timeout: 20_000 });
  }
}
