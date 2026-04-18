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
    const normalizedZip = zip?.replace(/\D/g, '');
    const cityRowCandidates = this.page.locator('a[id^="frm\\:select\\:"]');

    const matches = await cityRowCandidates.evaluateAll(
      (anchors, params) => {
        const clean = (value: string): string => value.replace(/\s+/g, ' ').trim().toUpperCase();
        const out: Array<{ id: string }> = [];

        for (const anchor of anchors as HTMLAnchorElement[]) {
          const text = clean(anchor.textContent || '');
          const parsed = text.match(/^(.+?)\s+\(PSČ:\s*(\d{5})\)$/);
          if (!parsed) {
            continue;
          }

          const city = parsed[1].trim();
          const rowZip = parsed[2];
          if (city !== params.city) {
            continue;
          }

          if (params.zip && rowZip !== params.zip) {
            continue;
          }

          out.push({ id: anchor.id });
        }

        return out;
      },
      { city: normalizedCity, zip: normalizedZip }
    );

    if (matches.length === 0) {
      throw new DppoAutomationError(`City "${cityInput}"${zip ? ` (${zip})` : ''} was not found in EPO city picker.`, {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }

    if (matches.length > 1) {
      throw new DppoAutomationError(
        `City picker returned multiple matches for "${cityInput}". Provide ZIP to disambiguate.`,
        {
          url: this.page.url(),
          pageTitle: await this.page.title()
        }
      );
    }

    const targetId = matches[0].id.replace(/"/g, '\\"');
    await this.page.locator(`[id="${targetId}"]`).click();
    await this.page.locator('#frm\\:vybrat').click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForFunction(() => document.title.includes('Daňový subjekt'), undefined, { timeout: 20_000 });
  }
}
