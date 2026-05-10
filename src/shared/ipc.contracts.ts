import type {
  GetCompanyByIcoInput,
  GetCompanyByIcoResult,
  UiProgressEvent
} from './justice-company.contracts';
import type {
  DppoProgressEvent,
  GenerateDppoXmlInput,
  GenerateDppoXmlResult
} from './dppo.contracts';
import type {
  DphRegistrationProgressEvent,
  GenerateDphRegistrationInput,
  GenerateDphRegistrationResult
} from './dph-registration.contracts';

export const IPC_CHANNELS = {
  FETCH_COMPANY_BY_ICO: 'automation:fetch-company-by-ico',
  PROGRESS: 'automation:progress',
  GENERATE_DPPO_XML: 'automation:generate-dppo-xml',
  DPPO_PROGRESS: 'automation:dppo-progress',
  GENERATE_DPH_REGISTRATION: 'automation:generate-dph-registration',
  DPH_REGISTRATION_PROGRESS: 'automation:dph-registration-progress',
  OPEN_XML_PATH: 'automation:open-xml-path'
} as const;

export type FetchCompanyByIcoFn = (input: GetCompanyByIcoInput) => Promise<GetCompanyByIcoResult>;
export type OnProgressFn = (listener: (event: UiProgressEvent) => void) => () => void;
export type GenerateDppoXmlFn = (input: GenerateDppoXmlInput) => Promise<GenerateDppoXmlResult>;
export type OnDppoProgressFn = (listener: (event: DppoProgressEvent) => void) => () => void;
export type GenerateDphRegistrationFn = (
  input: GenerateDphRegistrationInput
) => Promise<GenerateDphRegistrationResult>;
export type OnDphRegistrationProgressFn = (
  listener: (event: DphRegistrationProgressEvent) => void
) => () => void;
export type OpenXmlPathFn = (xmlPath: string) => Promise<{ ok: boolean; message?: string }>;

export type AutomationApi = {
  fetchCompanyByIco: FetchCompanyByIcoFn;
  onProgress: OnProgressFn;
  generateDppoXml: GenerateDppoXmlFn;
  onDppoProgress: OnDppoProgressFn;
  generateDphRegistration: GenerateDphRegistrationFn;
  onDphRegistrationProgress: OnDphRegistrationProgressFn;
  openXmlPath: OpenXmlPathFn;
};
