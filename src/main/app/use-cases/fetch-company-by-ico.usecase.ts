import type {
  GetCompanyByIcoInput,
  GetCompanyByIcoResult,
  UiProgressEvent
} from '../../../shared/justice-company.contracts';
import { DiagnosticsService } from '../../modules/diagnostics/diagnostics.service';
import { InputValidationError } from '../../modules/justice-company/justice-company.errors';
import { JusticeCompanyService } from '../../modules/justice-company/justice-company.service';
import { isValidCzechIco } from '../../modules/justice-company/justice-company.utils';

export class FetchCompanyByIcoUseCase {
  private readonly service = new JusticeCompanyService();

  async execute(
    input: GetCompanyByIcoInput,
    reportProgress: (event: UiProgressEvent) => void
  ): Promise<GetCompanyByIcoResult> {
    const diagnostics = new DiagnosticsService();

    try {
      reportProgress({
        step: 'validating_input',
        message: 'Validating IČO',
        timestamp: new Date().toISOString()
      });

      const ico = input.ico.replace(/\s+/g, '');
      if (!isValidCzechIco(ico)) {
        throw new InputValidationError('IČO must be 8 digits with a valid checksum.');
      }

      return this.service.fetchCompanyFromJusticeByIco(ico, diagnostics, reportProgress);
    } catch (error) {
      const isValidation = error instanceof InputValidationError;

      diagnostics.log('warn', 'input_error', isValidation ? 'Validation failed' : 'Unexpected error', {
        message: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'parse_error',
        message: isValidation
          ? 'IČO is not valid. Please check and try again.'
          : 'Unexpected error occurred while starting automation.',
        source: {
          registryBaseUrl: 'https://or.justice.cz/ias/ui/rejstrik',
          searchUrl: 'n/a',
          fetchedAt: new Date().toISOString(),
          diagnosticsDir: diagnostics.getRunDir()
        }
      };
    }
  }
}
