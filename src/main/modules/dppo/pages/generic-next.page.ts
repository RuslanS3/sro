import type { Page } from 'playwright';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';

export class GenericNextPage extends DppoBasePage {
  constructor(
    page: Page,
    logger: DppoLogger,
    private readonly titlePart: string
  ) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains(this.titlePart);
  }
}
