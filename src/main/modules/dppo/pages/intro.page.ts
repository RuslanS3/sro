import type { Page } from 'playwright';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';

export class IntroPage extends DppoBasePage {
  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Úvod - Přihláška k registraci pro právnické osoby');
  }
}
