import type { Page } from 'playwright';

/**
 * Click any visible cookie consent banner button.
 *
 * The MOJE daně portal renders a Bootstrap-style banner with a `<button>`
 * (not `<input type="submit">`) with class `btn-souhlas`. We try multiple
 * selectors to be tolerant to small UI changes.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    'button.btn-souhlas',
    'button:has-text("SOUHLAS SE VŠEMI")',
    'button:has-text("Souhlas se všemi")',
    'input[type="submit"][value="Souhlas se všemi"]'
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(300);
      return;
    }
  }
}

/**
 * Navigate to a sidebar section by visible link name. The MOJE daně portal
 * renders sidebar items as `<li role="menuitem">` with the URL slug stored
 * in the `id` attribute (e.g. `id="irs/ph1/zahlavi"`). We click them via
 * text match.
 */
export async function navigateToSidebarSection(
  page: Page,
  sectionName: string
): Promise<boolean> {
  await dismissCookieBanner(page);

  const item = page
    .locator('ul.sidebar-list li[role="menuitem"]', { hasText: sectionName })
    .first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    await page.waitForLoadState('domcontentloaded');
    return true;
  }

  // Fallback: any clickable element holding the section text.
  const fallback = page.locator('a, button, li', { hasText: sectionName }).first();
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click();
    await page.waitForLoadState('domcontentloaded');
    return true;
  }

  return false;
}
