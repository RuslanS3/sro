export type DppoPayload = {
  route: 'dppo';
  data: {
    financial_office: string;
    territorial_office: string;
    dic: string;
    registration_from_date: string;
    submission_place: string;
    submission_date: string;
    company_name: string;
    ico: string;
    street: string;
    house_number: string;
    orientation_number: string;
    city_input: string;
    zip: string;
    country_label: string;
    signatory_last_name: string;
    signatory_first_name: string;
    signatory_birth_date?: string;
    signatory_relationship: string;
    signer_mode?: 'authorized_person_for_legal_entity' | 'different_signer';
    signer_person_type?: 'physical' | 'legal';
    signer_code?: string;
    signer_birth_date?: string;
    business_start_date: string;
    business_authorization: string;
    expected_tax?: string;
    branch_offices_count?: number;
    premises_count?: number;
    phone?: string;
    email?: string;
  };
};

export type GenerateDppoXmlOptions = {
  headless?: boolean;
  slowMo?: number;
  downloadDir?: string;
  keepBrowserOpen?: boolean;
};

export type GenerateDppoXmlResult = {
  status: 'success' | 'error';
  xmlFilePath?: string;
  message?: string;
  screenshotPath?: string;
};
