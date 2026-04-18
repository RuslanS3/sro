import type { Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { toEpoDate } from '../utils/dates';

function toYesNoValue(input: string): string {
  return /ano|yes|true|vyd[aá]no\s+v\s+[čc]r/i.test(input) ? 'A - Ano' : 'N - Ne';
}

export class BusinessActivityPage extends DppoBasePage {
  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Podnikatelská činnost - Přihláška k registraci pro právnické osoby');
    await this.ensureVisible('input[id$="s_d_zahajeni:i_datum:d_zahajeni"]', 'Business activity page did not load start date field.');
  }

  async fill(payload: DppoPayload): Promise<void> {
    const data = payload.data;
    this.logger.log('info', 'Fill business activity page');

    await this.fillInputByIdSuffix('s_d_zahajeni:i_datum:d_zahajeni', toEpoDate(data.business_start_date));
    await this.selectByIdSuffix('s_opravneni_cr:i_seznam:opravneni_cr', toYesNoValue(data.business_authorization));
  }
}
