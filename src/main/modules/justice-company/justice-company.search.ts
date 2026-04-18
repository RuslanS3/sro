import type { Page } from 'playwright';
import type { CompanyCandidate, SourceMetadata } from '../../../shared/justice-company.contracts';
import type { SearchResult } from './justice-company.types';

const REGISTRY_BASE_URL = 'https://or.justice.cz/ias/ui/rejstrik';

function buildSearchUrl(ico: string): string {
  const params = new URLSearchParams({
    ico,
    jenPlatne: 'PLATNE',
    polozek: '50',
    typHledani: 'STARTS_WITH'
  });

  return `${REGISTRY_BASE_URL}-$firma?${params.toString()}`;
}

function buildSource(searchUrl: string): SourceMetadata {
  return {
    registryBaseUrl: REGISTRY_BASE_URL,
    searchUrl,
    fetchedAt: new Date().toISOString()
  };
}

export class JusticeCompanySearchService {
  async searchByIco(page: Page, ico: string): Promise<SearchResult> {
    const searchUrl = buildSearchUrl(ico);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1200);

    const candidates = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="subjektId="]'));
      const seen = new Set<string>();
      const result: Array<{ subjektId: string; companyName: string; ico?: string }> = [];

      for (const link of links) {
        const href = link.getAttribute('href') ?? '';
        const absoluteUrl = href.startsWith('http') ? href : new URL(href, window.location.origin).toString();
        const url = new URL(absoluteUrl);
        const subjektId = url.searchParams.get('subjektId');

        if (!subjektId || seen.has(subjektId)) {
          continue;
        }

        seen.add(subjektId);

        const rowText = link.closest('tr')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const icoMatch = rowText.match(/\b\d{8}\b/);
        result.push({
          subjektId,
          companyName: link.textContent?.replace(/\s+/g, ' ').trim() || rowText,
          ico: icoMatch?.[0]
        });
      }

      return result;
    });

    const source = buildSource(searchUrl);

    if (candidates.length === 0) {
      return {
        status: 'not_found',
        candidates: [],
        source
      };
    }

    const exactCandidates = candidates.filter((item) => item.ico === ico);
    const resolvedCandidates: CompanyCandidate[] = (exactCandidates.length > 0 ? exactCandidates : candidates).map((item) => ({
      subjektId: item.subjektId,
      companyName: item.companyName,
      ico: item.ico
    }));

    if (resolvedCandidates.length === 1) {
      return {
        status: 'single_result',
        candidate: resolvedCandidates[0],
        source: {
          ...source,
          subjektId: resolvedCandidates[0].subjektId
        }
      };
    }

    return {
      status: 'multiple_results',
      candidates: resolvedCandidates,
      source
    };
  }
}
