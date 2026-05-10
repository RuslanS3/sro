import type { Page } from 'playwright';

export async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    'input[type="submit"][value="Souhlas se všemi"]',
    'button:has-text("SOUHLAS SE VŠEMI")',
    'button:has-text("Souhlas se všemi")'
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(200);
      return;
    }
  }
}

