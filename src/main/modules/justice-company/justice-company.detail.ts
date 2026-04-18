import type { Page } from 'playwright';

export class JusticeCompanyDetailService {
  buildDetailUrl(subjektId: string): string {
    return `https://or.justice.cz/ias/ui/rejstrik-firma.vysledky?subjektId=${encodeURIComponent(subjektId)}&typ=PLATNY`;
  }

  async openDetailPage(page: Page, detailUrl: string): Promise<void> {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 45_000 });
    await page.waitForTimeout(900);
  }
}
