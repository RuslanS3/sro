/**
 * IPC contracts for the VAT (DPH) registration form module.
 *
 * Both main and renderer import from here. This file MUST NOT import from
 * `src/main/**` so that the renderer never accidentally pulls in Playwright.
 *
 * Target form: "Přihláška k registraci k dani z přidané hodnoty platná od 1.1.2015"
 */

export type SubjectType = 'P' | 'F'; // P = Právnická osoba, F = Fyzická osoba

export type RegistrationMode =
  | 'plátce'
  | 'identifikovaná_osoba'
  | 'bez_sídla_v_tuzemsku';

export type DphBankAccount = {
  prefix?: string;
  number: string;
  bank_code: string;
  account_type?: string;
  publish_in_public_register?: boolean;
};

export type DphEuRegistrationRow = {
  state: string;
  eu_vat_id: string;
  registration_date: string;
};

export type DphSignatureBlock = {
  signer_type_label?: string;
  signer_code_label?: string;

  signer_first_name?: string;
  signer_last_name?: string;
  signer_legal_entity_name?: string;
  signer_birth_date?: string;
  signer_advisor_certificate_number?: string;
  signer_legal_entity_ico?: string;

  authorized_first_name: string;
  authorized_last_name: string;
  authorized_relationship: string;
};

export type DphRegistrationData = {
  // ── Záhlaví ─────────────────────────────────────────────────────────
  financial_office: string;
  territorial_office: string;
  dic: string;
  birth_number?: string;
  subject_type: SubjectType;
  registration_modes: RegistrationMode[];

  // ── 04 Identification ───────────────────────────────────────────────
  company_name?: string;
  fo_last_name?: string;
  fo_birth_last_name?: string;
  fo_first_name?: string;
  fo_title?: string;

  // ── Sídlo ───────────────────────────────────────────────────────────
  street: string;
  house_number: string;
  orientation_number?: string;
  city: string;
  zip: string;
  country_label: string;
  country_code: string;

  // ── Skutečné sídlo ──────────────────────────────────────────────────
  actual_seat_same_as_registered: boolean;
  actual_seat_street?: string;
  actual_seat_house_number?: string;
  actual_seat_orientation_number?: string;
  actual_seat_city?: string;
  actual_seat_zip?: string;
  actual_seat_country_label?: string;
  actual_seat_country_code?: string;

  // ── Kontaktní informace ─────────────────────────────────────────────
  email?: string;
  phone?: string;
  delivery_proxy_label?: string;
  foreign_data_box_id?: string;

  // ── Registrační údaje ───────────────────────────────────────────────
  decisive_date?: string;
  registration_reason_label?: string;
  turnover?: string;
  previous_registration_cancel_date?: string;
  previous_registration_cancel_reason?: string;
  voluntary_registration_reason?: string;
  expected_annual_turnover?: string;
  eu_registrations?: DphEuRegistrationRow[];
  eori?: string;
  sme_identifier?: string;

  // ── Bankovní účty ───────────────────────────────────────────────────
  bank_accounts: DphBankAccount[];
  refund_account?: DphBankAccount;

  // ── Přílohy + podpis ────────────────────────────────────────────────
  attachments?: string[];
  text_attachment?: string;
  signature: DphSignatureBlock;

  // ── Závěr ───────────────────────────────────────────────────────────
  notification_email?: string;
};

export type DphRegistrationPayload = {
  route: 'dph-registration';
  data: DphRegistrationData;
};

export type GenerateDphRegistrationOptions = {
  headless?: boolean;
  slowMo?: number;
  downloadDir?: string;
  keepBrowserOpen?: boolean;
};

/**
 * One row from the EPO "Protokol chyb" dialog.
 *  - severity 'critical'   ⇒ blocks submission
 *  - severity 'serious'    ⇒ "Propustné závažné" — submission allowed but the
 *                             tax authority will likely send a notice to fix.
 *  - severity 'minor'      ⇒ "Propustné" — informational warnings only.
 */
export type DphProtocolError = {
  severity: 'critical' | 'serious' | 'minor';
  /** "POLOŽKA" — short field name. */
  field: string;
  /** "HLÁŠENÍ" — full message. */
  message: string;
  /** "KÓD CHYBY". */
  code?: string;
};

export type GenerateDphRegistrationResult = {
  status: 'success' | 'error';
  /** Path to "Stáhnout opis v PDF - bez barevného pozadí". */
  pdfFilePath?: string;
  /** Path to "Stáhnout soubor pro odeslání prostřednictvím datové schránky" (XML). */
  xmlFilePath?: string;
  /** Errors read from "PROTOKOL CHYB" dialog on /zaver. Empty if none. */
  protocolErrors?: DphProtocolError[];
  message?: string;
  screenshotPath?: string;
};

export type GenerateDphRegistrationInput = {
  payload: DphRegistrationPayload;
  options?: GenerateDphRegistrationOptions;
};

export type DphRegistrationProgressEvent = {
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
};
