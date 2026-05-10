import { useEffect, useMemo, useState } from 'react';
import type {
  GetCompanyByIcoResult,
  UiProgressEvent
} from '../shared/justice-company.contracts';
import type {
  DppoPayload,
  GenerateDppoXmlResult
} from '../shared/dppo.contracts';
import type {
  DphRegistrationPayload,
  GenerateDphRegistrationResult
} from '../shared/dph-registration.contracts';
import { pickRandomVoluntaryReason } from '../shared/dph-voluntary-reasons';

type DppoFormState = {
  financial_office: string;
  territorial_office: string;
  submission_place: string;
  submission_date: string;
  registration_from_date: string;
  business_authorization: string;
  expected_tax: string;
  signatory_last_name: string;
  signatory_first_name: string;
  signatory_birth_date: string;
};

type DphFormState = {
  voluntary_reason: string;
  expected_annual_turnover: string;
  registration_reason_label: string;
  bank_prefix: string;
  bank_number: string;
  bank_code: string;
  notification_email: string;
  /** Lower signature block — required even when justice has no jednatel. */
  authorized_first_name: string;
  authorized_last_name: string;
  authorized_relationship: string;
};

/**
 * Strip a Czech city name of any administrative suffix (district, dash, comma)
 * and ASCII-fold for selectById's partial label match.
 *
 *   "Praha 1"          → "PRAHA 1"
 *   "Brno-střed"       → "BRNO"
 *   "Olomouc, Hodolany" → "OLOMOUC"
 *   "České Budějovice 4" → "ČESKÉ BUDĚJOVICE 4"
 */
function cityToOfficeLabel(city: string): string {
  return city
    .replace(/\s*[-,–]\s*.*$/, '')
    .trim()
    .toUpperCase();
}

/**
 * Derive Czech tax-office territorial unit ("Územní pracoviště") from a
 * company address. Strategy:
 *   1. Prague: explicit "Praha N" district mapping by city or PSČ prefix.
 *   2. Other cities: uppercased city name — base.page selectById will fall
 *      back to a partial-label match so "BRNO" finds "BRNO I", etc.
 */
function deriveTerritorialOffice(
  city?: string,
  zip?: string
): string | null {
  if (city) {
    const m = city.match(/Praha\s*(\d{1,2})/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 10) return `PRAHA ${n}`;
    }
  }
  if (zip) {
    const clean = zip.replace(/\s+/g, '');
    if (/^\d{5}$/.test(clean)) {
      const prefix = parseInt(clean.slice(0, 2), 10);
      // Prague PSČ map: 11x→Praha 1, 12x→Praha 2, ..., 18x→Praha 8, 19x→Praha 9, 10x→Praha 10
      if (prefix === 10) return 'PRAHA 10';
      if (prefix >= 11 && prefix <= 19) return `PRAHA ${prefix - 10}`;
    }
  }

  // Non-Prague fallback: use the city name and rely on the select's
  // case-insensitive partial-label match.
  if (city && city.trim()) {
    return cityToOfficeLabel(city);
  }
  return null;
}

/**
 * Derive Czech tax-office financial region ("Finanční úřad pro") from a
 * company address by PSČ first digit (which roughly corresponds to a kraj):
 *
 *   1xx xx → HLAVNÍ MĚSTO PRAHA / STŘEDOČESKÝ KRAJ (best-guess)
 *   2xx xx → STŘEDOČESKÝ KRAJ
 *   3xx xx → JIHOČESKÝ / PLZEŇSKÝ
 *   4xx xx → ÚSTECKÝ / KARLOVARSKÝ
 *   5xx xx → KRÁLOVÉHRADECKÝ / PARDUBICKÝ / LIBERECKÝ
 *   6xx xx → JIHOMORAVSKÝ / KRAJ VYSOČINA
 *   7xx xx → ZLÍNSKÝ / OLOMOUCKÝ
 *   8xx xx → MORAVSKOSLEZSKÝ
 *
 * Where the first digit alone is ambiguous (3xx, 4xx, 5xx, 6xx, 7xx) we use
 * the second digit when possible. Prague gets a hard-coded match because
 * city name contains "Praha". Returns null when we cannot confidently
 * decide — caller keeps the existing default.
 */
function deriveFinancialOffice(
  city?: string,
  zip?: string
): string | null {
  if (city && /Praha/i.test(city)) return 'HLAVNÍ MĚSTO PRAHA';

  if (!zip) return null;
  const clean = zip.replace(/\s+/g, '');
  if (!/^\d{5}$/.test(clean)) return null;

  const d1 = clean[0];
  const d2 = clean[1];

  // 1xx xx — Praha region (10–19) and Středočeský (20–29 via 2x); 1xx itself is Praha.
  if (d1 === '1') return 'HLAVNÍ MĚSTO PRAHA';
  if (d1 === '2') return 'STŘEDOČESKÝ KRAJ';
  if (d1 === '3') {
    // 30–35 Plzeňský, 37–39 Jihočeský
    if (['3', '4', '5'].includes(d2)) return 'PLZEŇSKÝ KRAJ';
    if (['7', '8', '9'].includes(d2)) return 'JIHOČESKÝ KRAJ';
    return null;
  }
  if (d1 === '4') {
    // 40–44 Ústecký, 35–36 Karlovarský but those are in 3x; 4x mostly Ústecký
    return 'ÚSTECKÝ KRAJ';
  }
  if (d1 === '5') {
    // 50–55 Královéhradecký, 53–57 Pardubický, 46–47 Liberecký (in 4x), 58–59 Vysočina
    if (['0', '1', '2', '3', '4'].includes(d2)) return 'KRÁLOVÉHRADECKÝ KRAJ';
    if (['3', '4', '5', '6', '7'].includes(d2)) return 'PARDUBICKÝ KRAJ';
    return null;
  }
  if (d1 === '6') {
    // 60–69 Brno (Jihomoravský), 58–59 Vysočina handled above
    return 'JIHOMORAVSKÝ KRAJ';
  }
  if (d1 === '7') {
    // 70–73 Moravskoslezský, 74–76 Olomoucký, 76–77 Zlínský
    if (['0', '1', '2', '3'].includes(d2)) return 'MORAVSKOSLEZSKÝ KRAJ';
    if (['4', '5'].includes(d2)) return 'OLOMOUCKÝ KRAJ';
    if (['6', '7'].includes(d2)) return 'ZLÍNSKÝ KRAJ';
    return null;
  }
  if (d1 === '8') return 'MORAVSKOSLEZSKÝ KRAJ';

  return null;
}

function initialDphForm(): DphFormState {
  return {
    voluntary_reason: pickRandomVoluntaryReason(),
    expected_annual_turnover: '5000000',
    registration_reason_label: '§ 6f odst. 1',
    bank_prefix: '',
    bank_number: '',
    bank_code: '',
    notification_email: '',
    authorized_first_name: '',
    authorized_last_name: '',
    authorized_relationship: 'STATUTÁRNÍ ORGÁN'
  };
}

function toTodayCzDate(): string {
  const now = new Date();
  const d = `${now.getDate()}`.padStart(2, '0');
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const y = now.getFullYear();
  return `${d}.${m}.${y}`;
}

function normalizeCzDate(input?: string): string {
  if (!input) {
    return toTodayCzDate();
  }

  const value = input.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    return value;
  }

  const monthMap: Record<string, string> = {
    ledna: '01',
    unora: '02',
    brezna: '03',
    dubna: '04',
    kvetna: '05',
    cervna: '06',
    cervence: '07',
    srpna: '08',
    zari: '09',
    rijna: '10',
    listopadu: '11',
    prosince: '12'
  };

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const match = normalized.match(/^(\d{1,2})\.\s*([a-z]+)\s+(\d{4})$/);
  if (match && monthMap[match[2]]) {
    const day = match[1].padStart(2, '0');
    return `${day}.${monthMap[match[2]]}.${match[3]}`;
  }

  return toTodayCzDate();
}

function statusMessage(result: GetCompanyByIcoResult | null): string {
  if (!result) {
    return '';
  }

  switch (result.status) {
    case 'success':
      return 'Data společnosti byla úspěšně načtena.';
    case 'not_found':
      return 'Společnost pro zadané IČO nebyla nalezena.';
    case 'multiple_results':
      return 'Nalezeno více společností. Upřesněte výběr.';
    case 'parse_error':
      return result.message;
    default:
      return 'Neznámý stav.';
  }
}

const PROGRESS_LABELS: Record<UiProgressEvent['step'], string> = {
  validating_input: 'Kontrola IČO',
  opening_registry: 'Otevírání rejstříku',
  searching_company: 'Vyhledávání společnosti',
  opening_detail_page: 'Otevírání detailu společnosti',
  parsing_data: 'Čtení údajů',
  normalizing_data: 'Příprava strukturovaných dat',
  preparing_preview: 'Příprava náhledu',
  done: 'Hotovo'
};

function initialDppoForm(): DppoFormState {
  return {
    financial_office: 'HLAVNÍ MĚSTO PRAHA',
    territorial_office: 'PRAHA 8',
    submission_place: 'Praze',
    submission_date: toTodayCzDate(),
    registration_from_date: toTodayCzDate(),
    business_authorization: 'vydáno v ČR',
    expected_tax: '3000000',
    signatory_last_name: '',
    signatory_first_name: '',
    signatory_birth_date: ''
  };
}

function splitFullName(fullName?: string): { first: string; last: string } {
  const clean = (fullName ?? '').trim();
  if (!clean) {
    return { first: '', last: '' };
  }

  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }

  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function resolveSignatoryFromNormalized(result: GetCompanyByIcoResult): {
  first: string;
  last: string;
  birthDate?: string;
} {
  if (result.status !== 'success') {
    return { first: '', last: '' };
  }

  const statutory = result.normalizedData.statutory_body.persons[0];
  const shareholder = result.normalizedData.shareholders[0];
  const source = statutory ?? shareholder;
  if (!source) {
    return { first: '', last: '' };
  }

  const split = splitFullName(source.full_name);
  return {
    first: source.first_name || split.first,
    last: source.last_name || split.last,
    birthDate: source.birth_date
  };
}

export function App() {
  const [isElectronRuntime, setIsElectronRuntime] = useState<boolean | null>(null);
  const [ico, setIco] = useState('');
  const [progress, setProgress] = useState<UiProgressEvent[]>([]);
  const [result, setResult] = useState<GetCompanyByIcoResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dppoForm, setDppoForm] = useState<DppoFormState>(initialDppoForm());
  const [showBrowser] = useState(true);
  const [isDppoLoading, setIsDppoLoading] = useState(false);
  const [dppoResult, setDppoResult] = useState<GenerateDppoXmlResult | null>(null);
  const [dphForm, setDphForm] = useState<DphFormState>(initialDphForm());
  const [isDphLoading, setIsDphLoading] = useState(false);
  const [dphResult, setDphResult] = useState<GenerateDphRegistrationResult | null>(null);

  useEffect(() => {
    setIsElectronRuntime(typeof window !== 'undefined' && typeof window.automationApi !== 'undefined');
  }, []);

  useEffect(() => {
    if (!isElectronRuntime) {
      return;
    }

    return window.automationApi.onProgress((event) => {
      setProgress((prev) => [...prev, event]);
    });
  }, [isElectronRuntime]);

  useEffect(() => {
    if (result?.status !== 'success') {
      return;
    }

    const signatory = resolveSignatoryFromNormalized(result);
    const addr = result.normalizedData.address;
    const derivedTerritorial = deriveTerritorialOffice(addr?.city, addr?.zip);
    const derivedFinancial = deriveFinancialOffice(addr?.city, addr?.zip);

    setDppoForm((prev) => ({
      ...prev,
      registration_from_date: normalizeCzDate(result.normalizedData.registration_date),
      submission_date: prev.submission_date || toTodayCzDate(),
      signatory_first_name: signatory.first,
      signatory_last_name: signatory.last,
      signatory_birth_date: normalizeCzDate(signatory.birthDate),
      // Auto-derive tax offices from the company address (PSČ / city). User
      // can still override via the new UI inputs below.
      financial_office: derivedFinancial ?? prev.financial_office,
      territorial_office: derivedTerritorial ?? prev.territorial_office
    }));

    // Mirror signatory into the DPH form so the user can edit it independently
    // (e.g. when justice has no jednatel — fresh PO with no statutory body yet).
    setDphForm((prev) => ({
      ...prev,
      authorized_first_name: prev.authorized_first_name || signatory.first,
      authorized_last_name: prev.authorized_last_name || signatory.last
    }));
  }, [result]);

  const onFindCompany = async (): Promise<void> => {
    if (!isElectronRuntime) {
      return;
    }

    setIsLoading(true);
    setResult(null);
    setProgress([]);
    setDppoResult(null);

    try {
      const response = await window.automationApi.fetchCompanyByIco({ ico });
      setResult(response);
    } finally {
      setIsLoading(false);
    }
  };

  const preview = useMemo(() => {
    if (result?.status !== 'success') {
      return null;
    }

    const mainPerson = result.normalizedData.statutory_body.persons[0] ?? result.normalizedData.shareholders[0];

    return {
      companyName: result.normalizedData.company_name,
      ico: result.normalizedData.ico,
      address: result.normalizedData.address?.full,
      signatory: mainPerson?.full_name
    };
  }, [result]);

  const progressItems = useMemo(() => {
    const unique = new Map<UiProgressEvent['step'], UiProgressEvent>();
    for (const item of progress) {
      unique.set(item.step, item);
    }
    return Array.from(unique.values());
  }, [progress]);

  const currentProgress = progressItems[progressItems.length - 1] ?? null;

  const onRunDppo = async (): Promise<void> => {
    if (!isElectronRuntime || result?.status !== 'success') {
      return;
    }

    const n = result.normalizedData;
    const signatoryFirstName = dppoForm.signatory_first_name.trim();
    const signatoryLastName = dppoForm.signatory_last_name.trim();
    if (!signatoryFirstName || !signatoryLastName) {
      setDppoResult({
        status: 'error',
        message: 'Před spuštěním DPPO je nutné vyplnit jméno a příjmení podepisující osoby.'
      });
      return;
    }

    const payload: DppoPayload = {
      route: 'dppo',
      data: {
        financial_office: dppoForm.financial_office,
        territorial_office: dppoForm.territorial_office,
        dic: `CZ${n.ico ?? ''}`,
        registration_from_date: dppoForm.registration_from_date,
        submission_place: dppoForm.submission_place,
        submission_date: dppoForm.submission_date,
        company_name: n.company_name ?? '',
        ico: n.ico ?? '',
        street: n.address?.street ?? '',
        house_number: n.address?.house_number ?? '',
        orientation_number: n.address?.orientation_number ?? '',
        city_input: n.address?.city ?? '',
        zip: n.address?.zip ?? '',
        country_label: n.address?.country ?? 'Česká republika',
        signatory_last_name: signatoryLastName,
        signatory_first_name: signatoryFirstName,
        signatory_birth_date: dppoForm.signatory_birth_date || undefined,
        signatory_relationship: 'statutární orgán',
        signer_mode: 'authorized_person_for_legal_entity',
        signer_person_type: 'physical',
        business_start_date: dppoForm.registration_from_date,
        business_authorization: dppoForm.business_authorization,
        expected_tax: dppoForm.expected_tax,
        branch_offices_count: 0,
        premises_count: 0
      }
    };

    setIsDppoLoading(true);
    setDppoResult(null);

    try {
      const response = await window.automationApi.generateDppoXml({
        payload,
        options: {
          headless: !showBrowser,
          slowMo: showBrowser ? 150 : undefined,
          keepBrowserOpen: showBrowser
        }
      });
      setDppoResult(response);
      if (response.status === 'success' && response.xmlFilePath) {
        await window.automationApi.openXmlPath(response.xmlFilePath);
      }
    } finally {
      setIsDppoLoading(false);
    }
  };

  const onRunDph = async (): Promise<void> => {
    if (!isElectronRuntime || result?.status !== 'success') {
      return;
    }

    const n = result.normalizedData;
    const signatoryFirstName = dphForm.authorized_first_name.trim();
    const signatoryLastName = dphForm.authorized_last_name.trim();
    const signatoryRelationship =
      dphForm.authorized_relationship.trim() || 'STATUTÁRNÍ ORGÁN';
    if (!signatoryFirstName || !signatoryLastName) {
      setDphResult({
        status: 'error',
        message:
          'Před spuštěním DPH je nutné vyplnit Jméno a Příjmení oprávněné osoby (podpisová doložka).'
      });
      return;
    }

    const bankNumber = dphForm.bank_number.trim();
    const bankCode = dphForm.bank_code.trim();
    const bankAccounts =
      bankNumber && bankCode
        ? [
            {
              prefix: dphForm.bank_prefix.trim() || undefined,
              number: bankNumber,
              bank_code: bankCode,
              publish_in_public_register: true
            }
          ]
        : [];

    const payload: DphRegistrationPayload = {
      route: 'dph-registration',
      data: {
        financial_office: dppoForm.financial_office,
        territorial_office: dppoForm.territorial_office,
        dic: `CZ${n.ico ?? ''}`,
        subject_type: 'P',
        registration_modes: ['plátce'],
        company_name: n.company_name ?? '',
        street: n.address?.street ?? '',
        house_number: n.address?.house_number ?? '',
        orientation_number: n.address?.orientation_number ?? '',
        city: n.address?.city ?? '',
        zip: n.address?.zip ?? '',
        country_label: n.address?.country ?? 'ČESKÁ REPUBLIKA',
        country_code: 'CZ',
        actual_seat_same_as_registered: true,
        email: undefined,
        phone: undefined,
        registration_reason_label: dphForm.registration_reason_label,
        voluntary_registration_reason: dphForm.voluntary_reason,
        expected_annual_turnover: dphForm.expected_annual_turnover,
        bank_accounts: bankAccounts,
        refund_account: bankAccounts[0],
        signature: {
          authorized_first_name: signatoryFirstName,
          authorized_last_name: signatoryLastName,
          authorized_relationship: signatoryRelationship
        },
        notification_email: dphForm.notification_email || undefined
      }
    };

    setIsDphLoading(true);
    setDphResult(null);

    try {
      const response = await window.automationApi.generateDphRegistration({
        payload,
        options: {
          headless: !showBrowser,
          slowMo: showBrowser ? 150 : undefined,
          keepBrowserOpen: showBrowser
        }
      });
      setDphResult(response);
      if (response.status === 'success' && response.xmlFilePath) {
        await window.automationApi.openXmlPath(response.xmlFilePath);
      }
    } finally {
      setIsDphLoading(false);
    }
  };

  const canRun = ico.trim().length > 0 && !isLoading;
  const successResult = result?.status === 'success' ? result : null;

  if (isElectronRuntime === null) {
    return (
      <main className="layout">
        <section className="card">
          <h1>Automatizace obchodního rejstříku</h1>
          <p>Inicializace aplikace...</p>
        </section>
      </main>
    );
  }

  if (!isElectronRuntime) {
    return (
      <main className="layout">
        <section className="card">
          <h1>Automatizace obchodního rejstříku</h1>
          <p>
            Toto rozhraní musí běžet v Electronu, ne přímo v prohlížeči.
          </p>
          <p>
            Spusťte <code>npm run dev</code> a použijte otevřené desktopové okno.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <section className="card">
        <h1>Automatizace obchodního rejstříku</h1>
        <p>Zadejte IČO a načtěte oficiální data z justice.cz.</p>

        <label htmlFor="ico">IČO</label>
        <input
          id="ico"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 22249095"
          value={ico}
          onChange={(event) => setIco(event.target.value)}
          disabled={isLoading}
        />

        <button onClick={onFindCompany} disabled={!canRun}>
          {isLoading ? 'Zpracování...' : 'Najít data společnosti'}
        </button>

        <div className="status">{statusMessage(result)}</div>
      </section>

      <section className="card">
        <h2>Průběh</h2>
        {!currentProgress ? <p>Čeká na spuštění...</p> : null}
        {currentProgress ? (
          <div className="progress-panel">
            <div className="progress-current">
              <span className="progress-dot" />
              <strong>{PROGRESS_LABELS[currentProgress.step]}</strong>
            </div>
            <p className="progress-message">{currentProgress.message}</p>
            <div className={`progress-track ${currentProgress.step === 'done' ? 'done' : ''}`}>
              <span className="progress-shimmer" />
            </div>
            <div className="progress-steps">
              {progressItems.map((item, index) => (
                <div className="progress-step" key={`${item.timestamp}-${index}`}>
                  <span className={`progress-step-bullet ${item.step === currentProgress.step ? 'active' : ''}`} />
                  <span>{PROGRESS_LABELS[item.step]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Náhled výsledku</h2>
        {preview ? (
          <div className="preview-grid">
            <div>
              <span>Název společnosti</span>
              <strong>{preview.companyName}</strong>
            </div>
            <div>
              <span>IČO</span>
              <strong>{preview.ico}</strong>
            </div>
            <div>
              <span>Adresa</span>
              <strong>{preview.address}</strong>
            </div>
            <div>
              <span>Podepisující osoba</span>
              <strong>{preview.signatory}</strong>
            </div>
            <button type="button" onClick={onRunDppo} disabled={isDppoLoading || !successResult}>
              {isDppoLoading ? 'Spouštím DPPO...' : 'Potvrdit a pokračovat (DPPO XML)'}
            </button>
            {dppoResult ? (
              <div className="status">
                {dppoResult.status === 'success'
                  ? `XML vytvořeno: ${dppoResult.xmlFilePath}`
                  : `Chyba DPPO: ${dppoResult.message ?? 'Neznámá chyba'}`}
              </div>
            ) : null}
            {dppoResult?.status === 'success' && dppoResult.xmlFilePath ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => window.automationApi.openXmlPath(dppoResult.xmlFilePath!)}
              >
                Otevřít XML
              </button>
            ) : null}

            <hr style={{ width: '100%', margin: '16px 0', borderColor: '#eee' }} />
            <strong style={{ width: '100%' }}>
              Registrace DPH (Přihláška k registraci k dani z přidané hodnoty)
            </strong>

            <div>
              <span>Finanční úřad pro</span>
              <input
                type="text"
                value={dppoForm.financial_office}
                onChange={(e) =>
                  setDppoForm((p) => ({ ...p, financial_office: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Územní pracoviště v, ve, pro</span>
              <input
                type="text"
                value={dppoForm.territorial_office}
                onChange={(e) =>
                  setDppoForm((p) => ({ ...p, territorial_office: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>

            <div>
              <span>
                Jméno oprávněné osoby (podpis) *
                {!dphForm.authorized_first_name ? (
                  <em style={{ color: '#a33', marginLeft: 6 }}>
                    (justice nevrátil jednatela — vyplňte ručně)
                  </em>
                ) : null}
              </span>
              <input
                type="text"
                value={dphForm.authorized_first_name}
                onChange={(e) =>
                  setDphForm((p) => ({ ...p, authorized_first_name: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Příjmení oprávněné osoby (podpis) *</span>
              <input
                type="text"
                value={dphForm.authorized_last_name}
                onChange={(e) =>
                  setDphForm((p) => ({ ...p, authorized_last_name: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Vztah k právnické osobě</span>
              <input
                type="text"
                value={dphForm.authorized_relationship}
                onChange={(e) =>
                  setDphForm((p) => ({ ...p, authorized_relationship: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>

            <div>
              <span>Důvod podle § (06)</span>
              <input
                type="text"
                value={dphForm.registration_reason_label}
                onChange={(e) =>
                  setDphForm((p) => ({ ...p, registration_reason_label: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Důvod dobrovolné registrace (09)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={dphForm.voluntary_reason}
                  onChange={(e) =>
                    setDphForm((p) => ({ ...p, voluntary_reason: e.target.value }))
                  }
                  disabled={isDphLoading}
                />
                <button
                  type="button"
                  className="secondary-btn"
                  title="Vybrat jiný náhodný text"
                  onClick={() =>
                    setDphForm((p) => ({ ...p, voluntary_reason: pickRandomVoluntaryReason() }))
                  }
                  disabled={isDphLoading}
                >
                  Náhodný
                </button>
              </div>
            </div>
            <div>
              <span>Předpokládaný roční obrat (09a)</span>
              <input
                type="text"
                inputMode="numeric"
                value={dphForm.expected_annual_turnover}
                onChange={(e) =>
                  setDphForm((p) => ({ ...p, expected_annual_turnover: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Bankovní účet — předčíslí</span>
              <input
                type="text"
                value={dphForm.bank_prefix}
                onChange={(e) => setDphForm((p) => ({ ...p, bank_prefix: e.target.value }))}
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Bankovní účet — číslo účtu</span>
              <input
                type="text"
                value={dphForm.bank_number}
                onChange={(e) => setDphForm((p) => ({ ...p, bank_number: e.target.value }))}
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>Bankovní účet — kód banky</span>
              <input
                type="text"
                value={dphForm.bank_code}
                onChange={(e) => setDphForm((p) => ({ ...p, bank_code: e.target.value }))}
                disabled={isDphLoading}
              />
            </div>
            <div>
              <span>E-mail pro notifikaci</span>
              <input
                type="email"
                value={dphForm.notification_email}
                onChange={(e) =>
                  setDphForm((p) => ({ ...p, notification_email: e.target.value }))
                }
                disabled={isDphLoading}
              />
            </div>

            <button
              type="button"
              onClick={onRunDph}
              disabled={isDphLoading || !successResult}
            >
              {isDphLoading ? 'Spouštím DPH...' : 'Vygenerovat registraci DPH (PDF + XML)'}
            </button>
            {dphResult ? (
              <div className="status">
                {dphResult.status === 'success'
                  ? `Hotovo. PDF: ${dphResult.pdfFilePath ?? '-'} | XML: ${dphResult.xmlFilePath ?? '-'}`
                  : `Chyba DPH: ${dphResult.message ?? 'Neznámá chyba'}`}
              </div>
            ) : null}
            {dphResult?.protocolErrors && dphResult.protocolErrors.length > 0 ? (
              <details style={{ width: '100%', marginTop: 8 }}>
                <summary>
                  Protokol chyb ({dphResult.protocolErrors.length} položek):{' '}
                  {dphResult.protocolErrors.filter((e) => e.severity === 'critical').length}
                  {' '}kritických,{' '}
                  {dphResult.protocolErrors.filter((e) => e.severity === 'serious').length}
                  {' '}propustných závažných,{' '}
                  {dphResult.protocolErrors.filter((e) => e.severity === 'minor').length}
                  {' '}propustných
                </summary>
                <ul style={{ marginTop: 8 }}>
                  {dphResult.protocolErrors.map((e, idx) => (
                    <li key={idx}>
                      <strong>[{e.severity}]</strong> {e.field} — {e.message}
                      {e.code ? ` (kód ${e.code})` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {dphResult?.status === 'success' && dphResult.xmlFilePath ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => window.automationApi.openXmlPath(dphResult.xmlFilePath!)}
              >
                Otevřít XML
              </button>
            ) : null}
            {dphResult?.status === 'success' && dphResult.pdfFilePath ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => window.automationApi.openXmlPath(dphResult.pdfFilePath!)}
              >
                Otevřít PDF
              </button>
            ) : null}
          </div>
        ) : (
          <p>Po úspěšném načtení se zde zobrazí náhled.</p>
        )}

        {result?.status === 'multiple_results' ? (
          <div>
            <p>Nalezené společnosti:</p>
            <ul>
              {result.candidates.map((candidate) => (
                <li key={candidate.subjektId}>
                  {candidate.companyName} ({candidate.ico ?? 'IČO není dostupné'})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

    </main>
  );
}

