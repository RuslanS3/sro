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
    signatory_relationship: string;
    business_start_date: string;
    business_authorization: string;
    branch_offices_count?: number;
    premises_count?: number;
    phone?: string;
    email?: string;
  };
};

export type GenerateDppoXmlInput = {
  payload: DppoPayload;
  options?: {
    headless?: boolean;
    slowMo?: number;
    downloadDir?: string;
    keepBrowserOpen?: boolean;
  };
};

export type GenerateDppoXmlResult = {
  status: 'success' | 'error';
  xmlFilePath?: string;
  message?: string;
  screenshotPath?: string;
};

export type DppoProgressEvent = {
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
};
