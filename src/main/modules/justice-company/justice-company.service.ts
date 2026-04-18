import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import type {
  GetCompanyByIcoResult,
  SourceMetadata
} from '../../../shared/justice-company.contracts';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { JusticeCompanySearchService } from './justice-company.search';
import { JusticeCompanyDetailService } from './justice-company.detail';
import { JusticeCompanyExtractService } from './justice-company.extract';
import { JusticeCompanyNormalizeService } from './justice-company.normalize';
import { JusticeCompanyMapper } from './justice-company.mapper';
import type { ProgressReporter } from './justice-company.types';
import { ParseError } from './justice-company.errors';

export class JusticeCompanyService {
  private readonly searchService = new JusticeCompanySearchService();
  private readonly detailService = new JusticeCompanyDetailService();
  private readonly extractService = new JusticeCompanyExtractService();
  private readonly normalizeService = new JusticeCompanyNormalizeService();
  private readonly mapper = new JusticeCompanyMapper();

  async fetchCompanyFromJusticeByIco(
    ico: string,
    diagnostics: DiagnosticsService,
    reportProgress: ProgressReporter
  ): Promise<GetCompanyByIcoResult> {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let lastSource: Partial<SourceMetadata> | undefined;

    try {
      reportProgress({
        step: 'opening_registry',
        message: 'Opening justice.cz registry',
        timestamp: new Date().toISOString()
      });

      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({ locale: 'cs-CZ' });
      page = await context.newPage();

      reportProgress({
        step: 'searching_company',
        message: 'Searching company by IČO',
        timestamp: new Date().toISOString()
      });

      const searchResult = await this.searchService.searchByIco(page, ico);
      lastSource = searchResult.source;
      diagnostics.log('info', 'search_result', 'Search finished', {
        status: searchResult.status,
        candidateCount: searchResult.status === 'single_result' ? 1 : searchResult.candidates.length
      });

      if (searchResult.status === 'not_found') {
        return {
          status: 'not_found',
          message: 'Company not found in registry.',
          source: {
            ...searchResult.source,
            diagnosticsDir: diagnostics.getRunDir()
          }
        };
      }

      if (searchResult.status === 'multiple_results') {
        return {
          status: 'multiple_results',
          message: 'More than one company matched this IČO.',
          source: {
            ...searchResult.source,
            diagnosticsDir: diagnostics.getRunDir()
          },
          candidates: searchResult.candidates
        };
      }

      const detailUrl = this.detailService.buildDetailUrl(searchResult.candidate.subjektId);
      lastSource = {
        ...lastSource,
        detailUrl,
        subjektId: searchResult.candidate.subjektId
      };
      reportProgress({
        step: 'opening_detail_page',
        message: 'Opening company detail extract',
        timestamp: new Date().toISOString()
      });

      await this.detailService.openDetailPage(page, detailUrl);

      reportProgress({
        step: 'parsing_data',
        message: 'Extracting company data',
        timestamp: new Date().toISOString()
      });

      const { rawData, htmlSnapshot } = await this.extractService.extractRawData(page);
      diagnostics.writeSnapshot('detail-page.html', htmlSnapshot);

      if (!rawData.companyName || !rawData.ico) {
        throw new ParseError('Required fields (company name or IČO) could not be extracted.');
      }

      reportProgress({
        step: 'normalizing_data',
        message: 'Normalizing scraped data',
        timestamp: new Date().toISOString()
      });

      const normalizedData = this.normalizeService.normalize(rawData);
      const mappedData = this.mapper.toStage2Draft(normalizedData);

      reportProgress({
        step: 'preparing_preview',
        message: 'Preparing result preview',
        timestamp: new Date().toISOString()
      });

      const source: SourceMetadata = {
        ...searchResult.source,
        detailUrl,
        fetchedAt: new Date().toISOString(),
        diagnosticsDir: diagnostics.getRunDir(),
        subjektId: searchResult.candidate.subjektId
      };

      return {
        status: 'success',
        source,
        rawData,
        normalizedData,
        mappedData
      };
    } catch (error) {
      diagnostics.log('error', 'justice_fetch_failed', 'Automation failed', {
        message: error instanceof Error ? error.message : String(error)
      });

      let screenshotPath: string | undefined;
      let rawSnapshotPath: string | undefined;

      if (page) {
        screenshotPath = `${diagnostics.getRunDir()}/failure.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
        const html = await page.content().catch(() => undefined);
        if (html) {
          rawSnapshotPath = diagnostics.writeSnapshot('failure.html', html);
        }
      }

      return {
        status: 'parse_error',
        message: 'Could not read company details from registry. Please try again.',
        source: {
          registryBaseUrl: 'https://or.justice.cz/ias/ui/rejstrik',
          searchUrl: lastSource?.searchUrl ?? 'n/a',
          detailUrl: lastSource?.detailUrl,
          subjektId: lastSource?.subjektId,
          fetchedAt: new Date().toISOString(),
          diagnosticsDir: diagnostics.getRunDir()
        },
        rawSnapshotPath,
        screenshotPath
      };
    } finally {
      if (context) {
        await context.close();
      }
      if (browser) {
        await browser.close();
      }

      reportProgress({
        step: 'done',
        message: 'Flow finished',
        timestamp: new Date().toISOString()
      });
    }
  }
}
