import type { Locator, Page } from 'playwright';
import type { DppoLogger } from '../logger';
import { DppoAutomationError } from '../errors';
import { dismissCookieBanner } from '../utils/epo-ui';

export abstract class DppoBasePage {
  protected constructor(
    protected readonly page: Page,
    protected readonly logger: DppoLogger
  ) {}

  abstract assertLoaded(): Promise<void>;

  protected async expectTitleContains(expected: string): Promise<void> {
    await this.page.waitForFunction(
      (value) => document.title.includes(value),
      expected,
      { timeout: 30_000 }
    );
  }

  protected nextButton(): Locator {
    return this.page.locator('input[type="submit"][value="Další stránka"]').first();
  }

  async next(): Promise<void> {
    this.logger.log('info', 'Click next page');
    await dismissCookieBanner(this.page);
    await this.nextButton().click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  protected async fillInputByIdSuffix(idSuffix: string, value: string): Promise<void> {
    await dismissCookieBanner(this.page);
    const input = this.page.locator(`input[id$="${idSuffix}"]`).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill(value);
  }

  protected async fillTextareaByIdSuffix(idSuffix: string, value: string): Promise<void> {
    await dismissCookieBanner(this.page);
    const input = this.page.locator(`textarea[id$="${idSuffix}"]`).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill(value);
  }

  protected async selectByIdSuffix(idSuffix: string, valueOrLabel: string): Promise<void> {
    await dismissCookieBanner(this.page);
    const select = this.page.locator(`select[id$="${idSuffix}"]`).first();
    await select.waitFor({ state: 'visible', timeout: 10_000 });

    try {
      await select.selectOption({ label: valueOrLabel });
    } catch {
      await select.selectOption(valueOrLabel);
    }
  }

  protected async safeClickByValue(value: string): Promise<void> {
    await dismissCookieBanner(this.page);
    const button = this.page.locator(`input[type="submit"][value="${value}"]`).first();
    await button.click();
  }

  protected async ensureVisible(selector: string, message: string): Promise<void> {
    const locator = this.page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      throw new DppoAutomationError(message, {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }
  }
}
