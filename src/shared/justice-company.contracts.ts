export type UseCaseStatus = 'success' | 'not_found' | 'multiple_results' | 'parse_error';

export type GetCompanyByIcoInput = {
  ico: string;
  debugMode?: boolean;
};

export type ProgressStep =
  | 'validating_input'
  | 'opening_registry'
  | 'searching_company'
  | 'opening_detail_page'
  | 'parsing_data'
  | 'normalizing_data'
  | 'preparing_preview'
  | 'done';

export type UiProgressEvent = {
  step: ProgressStep;
  message: string;
  timestamp: string;
};

export type CompanyCandidate = {
  subjektId: string;
  companyName: string;
  ico?: string;
};

export type SourceMetadata = {
  registryBaseUrl: string;
  searchUrl: string;
  detailUrl?: string;
  subjektId?: string;
  fetchedAt: string;
  diagnosticsDir?: string;
};

export type Address = {
  full: string;
  street?: string;
  house_number?: string;
  orientation_number?: string;
  district?: string;
  zip?: string;
  city?: string;
  country?: string;
};

export type Person = {
  first_name?: string;
  last_name?: string;
  full_name: string;
  birth_date?: string;
  address?: Address;
  function_start_date?: string;
};

export type Share = {
  deposit_amount_czk?: number;
  deposit_amount_text?: string;
  paid_percent?: number;
  ownership_percent?: number;
};

export type Shareholder = Person & {
  share?: Share;
};

export type JusticeCompanyRawData = {
  sourceUrl: string;
  extractedAt: string;
  labelMap: Record<string, string>;
  bodyText?: string;
  registrationDate?: string;
  fileNumberWithCourt?: string;
  companyName?: string;
  address?: string;
  ico?: string;
  legalForm?: string;
  businessActivities?: string;
  statutoryBody?: string;
  memberCount?: string;
  actingMethod?: string;
  shareholders?: string;
  share?: string;
  basicCapital?: string;
};

export type JusticeCompanyNormalizedData = {
  registration_date?: string;
  file_number?: string;
  court?: string;
  company_name?: string;
  address?: Address;
  ico?: string;
  legal_form?: string;
  business_activities: string[];
  statutory_body: {
    role?: string;
    persons: Person[];
    member_count?: number;
    acting_method?: string;
  };
  shareholders: Shareholder[];
  basic_capital?: {
    amount_czk?: number;
    amount_text?: string;
  };
};

export type Stage2FieldCategory = 'scraped' | 'derived' | 'manual';

export type Stage2MappedField = {
  value?: string | number;
  category: Stage2FieldCategory;
};

export type Stage2MappedData = {
  route: 'dppo';
  data: Record<string, Stage2MappedField>;
};

export type GetCompanyByIcoSuccess = {
  status: 'success';
  source: SourceMetadata;
  rawData: JusticeCompanyRawData;
  normalizedData: JusticeCompanyNormalizedData;
  mappedData?: Stage2MappedData;
};

export type GetCompanyByIcoNotFound = {
  status: 'not_found';
  message: string;
  source: SourceMetadata;
};

export type GetCompanyByIcoMultiple = {
  status: 'multiple_results';
  message: string;
  source: SourceMetadata;
  candidates: CompanyCandidate[];
};

export type GetCompanyByIcoParseError = {
  status: 'parse_error';
  message: string;
  source: SourceMetadata;
  rawSnapshotPath?: string;
  screenshotPath?: string;
};

export type GetCompanyByIcoResult =
  | GetCompanyByIcoSuccess
  | GetCompanyByIcoNotFound
  | GetCompanyByIcoMultiple
  | GetCompanyByIcoParseError;
