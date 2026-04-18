import { useEffect, useMemo, useState } from 'react';
import type {
  GetCompanyByIcoResult,
  UiProgressEvent
} from '../shared/justice-company.contracts';
import type {
  DppoPayload,
  GenerateDppoXmlResult
} from '../shared/dppo.contracts';

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

export function App(): JSX.Element {
  const [isElectronRuntime, setIsElectronRuntime] = useState<boolean | null>(null);
  const [ico, setIco] = useState('');
  const [progress, setProgress] = useState<UiProgressEvent[]>([]);
  const [result, setResult] = useState<GetCompanyByIcoResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dppoForm, setDppoForm] = useState<DppoFormState>(initialDppoForm());
  const [showBrowser, setShowBrowser] = useState(true);
  const [isDppoLoading, setIsDppoLoading] = useState(false);
  const [dppoResult, setDppoResult] = useState<GenerateDppoXmlResult | null>(null);

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

    setDppoForm((prev) => ({
      ...prev,
      registration_from_date: normalizeCzDate(result.normalizedData.registration_date),
      submission_date: prev.submission_date || toTodayCzDate(),
      signatory_first_name: signatory.first,
      signatory_last_name: signatory.last,
      signatory_birth_date: normalizeCzDate(signatory.birthDate)
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
