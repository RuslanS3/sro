import type { DppoSubmissionInput, DppoSubmissionResult } from './dppo.types';
import { DppoMapper } from './dppo.mapper';
import { generateDppoXml } from './submit-dppo';
import type { DppoPayload } from './types';

export class DppoSubmitService {
  private readonly mapper = new DppoMapper();

  async submit(input: DppoSubmissionInput): Promise<DppoSubmissionResult> {
    const payload = input.payload ?? this.buildPayloadFromMappedInput(input);
    if (!payload) {
      return {
        status: 'failed',
        message: 'DPPO payload is missing and cannot be derived from mapped data.'
      };
    }

    const result = await generateDppoXml(payload, { headless: true });
    if (result.status === 'success') {
      return {
        status: 'submitted',
        message: 'XML file generated successfully.',
        xmlFilePath: result.xmlFilePath
      };
    }

    return {
      status: 'error',
      message: result.message ?? 'Failed to generate DPPO XML.',
      screenshotPath: result.screenshotPath
    };
  }

  private buildPayloadFromMappedInput(input: DppoSubmissionInput): DppoPayload | null {
    const merged = this.mapper.mergeManualFields(input.mappedData, input.manualFields);
    const requiredKeys: Array<keyof DppoPayload['data']> = [
      'financial_office',
      'territorial_office',
      'dic',
      'registration_from_date',
      'submission_place',
      'submission_date',
      'company_name',
      'ico',
      'street',
      'house_number',
      'orientation_number',
      'city_input',
      'zip',
      'country_label',
      'signatory_last_name',
      'signatory_first_name',
      'signatory_relationship',
      'business_start_date',
      'business_authorization'
    ];

    const missing = requiredKeys.filter((key) => !merged[key]);
    if (missing.length > 0) {
      return null;
    }

    return {
      route: 'dppo',
      data: {
        financial_office: merged.financial_office,
        territorial_office: merged.territorial_office,
        dic: merged.dic,
        registration_from_date: merged.registration_from_date,
        submission_place: merged.submission_place,
        submission_date: merged.submission_date,
        company_name: merged.company_name,
        ico: merged.ico,
        street: merged.street,
        house_number: merged.house_number,
        orientation_number: merged.orientation_number,
        city_input: merged.city_input,
        zip: merged.zip,
        country_label: merged.country_label,
        signatory_last_name: merged.signatory_last_name,
        signatory_first_name: merged.signatory_first_name,
        signatory_relationship: merged.signatory_relationship,
        business_start_date: merged.business_start_date,
        business_authorization: merged.business_authorization,
        expected_tax: merged.expected_tax || undefined,
        branch_offices_count: merged.branch_offices_count ? Number.parseInt(merged.branch_offices_count, 10) : undefined,
        premises_count: merged.premises_count ? Number.parseInt(merged.premises_count, 10) : undefined,
        phone: merged.phone || undefined,
        email: merged.email || undefined
      }
    };
  }
}
