import type { Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';

function normalizeAmount(input?: string): string {
  if (!input) {
    return '0';
  }

  const digits = input.replace(/\D/g, '');
  return digits || '0';
}

export class TaxRegistrationPage extends DppoBasePage {
  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Daňová registrace - Přihláška k registraci pro právnické osoby');
    await this.ensureVisible('input[id$="s_kc_drp_770:i_vstup:kc_dpr_770"]', 'Tax registration page did not load expected amount field.');
  }

  async fill(payload: DppoPayload): Promise<void> {
    this.logger.log('info', 'Fill tax registration page');

    const amount = normalizeAmount(payload.data.expected_tax);
    await this.fillInputByIdSuffix('s_kc_drp_770:i_vstup:kc_dpr_770', amount);
  }
}
