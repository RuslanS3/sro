import type { Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { toEpoDate } from '../utils/dates';

export class HeaderPage extends DppoBasePage {
  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Záhlaví - Přihláška k registraci pro právnické osoby');
    await this.ensureVisible('input[id$="c_ufo"]', 'Header page did not load expected tax office field.');
  }

  async fill(payload: DppoPayload): Promise<void> {
    const data = payload.data;

    this.logger.log('info', 'Fill header page');
    await this.selectByIdSuffix('c_ufo_sez', data.financial_office);
    await this.syncCodeFromSelectToInput('c_ufo_sez', 'c_ufo');

    await this.selectByIdSuffix('c_pracufo_sez', data.territorial_office);
    await this.syncCodeFromSelectToInput('c_pracufo_sez', 'c_pracufo');
    const dicInput = this.page.locator('input[id$="s_dic:i_vstup:dic"]').first();
    if (await dicInput.isVisible().catch(() => false)) {
      await dicInput.fill(data.dic.replace(/^CZ/i, ''));
    }
    await this.selectByIdSuffix('s_drp_770:i_seznam:drp_770', 'A - Ano');
    await this.fillInputByIdSuffix('s_misto:i_vstup:misto', data.submission_place);
    await this.fillInputByIdSuffix('s_d_vyhotov:i_datum:d_vyhotov', toEpoDate(data.submission_date));
  }

  private async syncCodeFromSelectToInput(selectSuffix: string, inputSuffix: string): Promise<void> {
    const selectedValue = await this.page.locator(`select[id$="${selectSuffix}"]`).first().inputValue();
    if (!selectedValue) {
      return;
    }

    await this.fillInputByIdSuffix(inputSuffix, selectedValue);
  }
}
