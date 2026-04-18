import type {
  JusticeCompanyNormalizedData,
  Stage2MappedData,
  Stage2MappedField
} from '../../../shared/justice-company.contracts';

function field(value: string | number | undefined, category: Stage2MappedField['category']): Stage2MappedField {
  return { value, category };
}

export class JusticeCompanyMapper {
  toStage2Draft(normalizedData: JusticeCompanyNormalizedData): Stage2MappedData {
    const signatory = normalizedData.statutory_body.persons[0];

    return {
      route: 'dppo',
      data: {
        company_name: field(normalizedData.company_name, 'scraped'),
        ico: field(normalizedData.ico, 'scraped'),
        street: field(normalizedData.address?.street, 'scraped'),
        house_number: field(normalizedData.address?.house_number, 'scraped'),
        orientation_number: field(normalizedData.address?.orientation_number, 'scraped'),
        city_input: field(normalizedData.address?.city, 'scraped'),
        zip: field(normalizedData.address?.zip, 'scraped'),
        country_label: field('CZ ČESKÁ REPUBLIKA', 'derived'),
        dic: field(normalizedData.ico ? `CZ${normalizedData.ico}` : undefined, 'derived'),
        submission_date: field('AUTO_TODAY', 'derived'),
        signatory_last_name: field(signatory?.last_name, 'scraped'),
        signatory_first_name: field(signatory?.first_name, 'scraped'),
        signatory_relationship: field('statutární orgán', 'derived'),
        financial_office: field(undefined, 'manual'),
        territorial_office: field(undefined, 'manual'),
        expected_tax: field(undefined, 'manual'),
        business_authorization: field(undefined, 'manual')
      }
    };
  }
}
