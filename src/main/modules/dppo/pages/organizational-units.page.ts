import type { Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';

export class OrganizationalUnitsPage extends DppoBasePage {
  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Organizační složky obchodního závodu - Přihláška k registraci pro právnické osoby');
    await this.ensureVisible('input[id$="s_pocet_odzav:i_vstup:pocet_odzav"]', 'Organizational units page did not load expected count fields.');
  }

  async fill(payload: DppoPayload): Promise<void> {
    const data = payload.data;

    this.logger.log('info', 'Fill organizational units page');
    await this.fillInputByIdSuffix('s_pocet_odzav:i_vstup:pocet_odzav', String(data.branch_offices_count ?? 0));
    await this.fillInputByIdSuffix('s_pocet_provoz:i_vstup:pocet_provoz', String(data.premises_count ?? 0));
  }
}
