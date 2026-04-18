import { useEffect, useMemo, useState } from 'react';
import type {
  GetCompanyByIcoResult,
  UiProgressEvent
} from '../shared/justice-company.contracts';
import type {
  DppoPayload,
  DppoProgressEvent,
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
      return 'Company data loaded successfully.';
    case 'not_found':
      return 'Company not found for entered IČO.';
    case 'multiple_results':
      return 'More than one company found. Please refine selection later.';
    case 'parse_error':
      return result.message;
    default:
      return 'Unknown status.';
  }
}

function initialDppoForm(): DppoFormState {
  return {
    financial_office: 'HLAVNÍ MĚSTO PRAHA',
    territorial_office: 'PRAHA 8',
    submission_place: 'Praze',
    submission_date: toTodayCzDate(),
    registration_from_date: toTodayCzDate(),
    business_authorization: 'vydáno v ČR',
    expected_tax: '3000000',
    signatory_birth_date: ''
  };
}

export function App(): JSX.Element {
  const [isElectronRuntime, setIsElectronRuntime] = useState<boolean | null>(null);
  const [ico, setIco] = useState('');
  const [progress, setProgress] = useState<UiProgressEvent[]>([]);
  const [result, setResult] = useState<GetCompanyByIcoResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeDataTab, setActiveDataTab] = useState<'normalized' | 'raw' | 'mapped' | 'source'>('normalized');

  const [dppoForm, setDppoForm] = useState<DppoFormState>(initialDppoForm());
  const [showBrowser, setShowBrowser] = useState(true);
  const [isDppoLoading, setIsDppoLoading] = useState(false);
  const [dppoProgress, setDppoProgress] = useState<DppoProgressEvent[]>([]);
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
    if (!isElectronRuntime) {
      return;
    }

    return window.automationApi.onDppoProgress((event) => {
      setDppoProgress((prev) => [...prev, event]);
    });
  }, [isElectronRuntime]);

  useEffect(() => {
    if (result?.status !== 'success') {
      return;
    }

    setDppoForm((prev) => ({
      ...prev,
      registration_from_date: normalizeCzDate(result.normalizedData.registration_date),
      submission_date: prev.submission_date || toTodayCzDate(),
      signatory_birth_date: normalizeCzDate(result.normalizedData.statutory_body.persons[0]?.birth_date)
    }));
  }, [result]);

  const onFindCompany = async (): Promise<void> => {
    if (!isElectronRuntime) {
      return;
    }

    setIsLoading(true);
    setResult(null);
    setProgress([]);
    setActiveDataTab('normalized');
    setDppoResult(null);
    setDppoProgress([]);

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

    const mainPerson = result.normalizedData.statutory_body.persons[0];

    return {
      companyName: result.normalizedData.company_name,
      ico: result.normalizedData.ico,
      address: result.normalizedData.address?.full,
      signatory: mainPerson?.full_name
    };
  }, [result]);

  const onRunDppo = async (): Promise<void> => {
    if (!isElectronRuntime || result?.status !== 'success') {
      return;
    }

    const n = result.normalizedData;
    const signatory = n.statutory_body.persons[0];

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
        signatory_last_name: signatory?.last_name ?? '',
        signatory_first_name: signatory?.first_name ?? '',
        signatory_birth_date: dppoForm.signatory_birth_date || undefined,
        signatory_relationship: 'statutární orgán',
        business_start_date: dppoForm.registration_from_date,
        business_authorization: dppoForm.business_authorization,
        expected_tax: dppoForm.expected_tax,
        branch_offices_count: 0,
        premises_count: 0
      }
    };

    setIsDppoLoading(true);
    setDppoProgress([]);
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
          <h1>Company Registry Automation</h1>
          <p>Initializing application...</p>
        </section>
      </main>
    );
  }

  if (!isElectronRuntime) {
    return (
      <main className="layout">
        <section className="card">
          <h1>Company Registry Automation</h1>
          <p>
            This UI must be launched inside Electron, not directly in a browser tab.
          </p>
          <p>
            Run <code>npm run dev</code> and use the opened desktop window.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <section className="card">
        <h1>Company Registry Automation</h1>
        <p>Enter IČO and fetch official data from justice.cz.</p>

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
          {isLoading ? 'Processing...' : 'Find company data'}
        </button>

        <div className="status">{statusMessage(result)}</div>
      </section>

      <section className="card">
        <h2>Progress</h2>
        {progress.length === 0 ? <p>Waiting for action...</p> : null}
        <ul>
          {progress.map((item, index) => (
            <li key={`${item.timestamp}-${index}`}>
              <strong>{item.step}</strong>: {item.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Result preview</h2>
        {preview ? (
          <div className="preview-grid">
            <div>
              <span>Company name</span>
              <strong>{preview.companyName}</strong>
            </div>
            <div>
              <span>IČO</span>
              <strong>{preview.ico}</strong>
            </div>
            <div>
              <span>Address</span>
              <strong>{preview.address}</strong>
            </div>
            <div>
              <span>Signatory</span>
              <strong>{preview.signatory}</strong>
            </div>
            <button type="button" onClick={onRunDppo} disabled={isDppoLoading || !successResult}>
              {isDppoLoading ? 'Running DPPO...' : 'Confirm and continue (DPPO XML)'}
            </button>
          </div>
        ) : (
          <p>Result will appear here after successful extraction.</p>
        )}

        {result?.status === 'multiple_results' ? (
          <div>
            <p>Detected candidates:</p>
            <ul>
              {result.candidates.map((candidate) => (
                <li key={candidate.subjektId}>
                  {candidate.companyName} ({candidate.ico ?? 'IČO unavailable'})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="card card-wide">
        <h2>DPPO UI Run</h2>
        <div className="dppo-grid">
          <label>
            Finanční úřad
            <input
              type="text"
              value={dppoForm.financial_office}
              onChange={(e) => setDppoForm((p) => ({ ...p, financial_office: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Územní pracoviště
            <input
              type="text"
              value={dppoForm.territorial_office}
              onChange={(e) => setDppoForm((p) => ({ ...p, territorial_office: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Place
            <input
              type="text"
              value={dppoForm.submission_place}
              onChange={(e) => setDppoForm((p) => ({ ...p, submission_place: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Submission date
            <input
              type="text"
              value={dppoForm.submission_date}
              onChange={(e) => setDppoForm((p) => ({ ...p, submission_date: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Registration from
            <input
              type="text"
              value={dppoForm.registration_from_date}
              onChange={(e) => setDppoForm((p) => ({ ...p, registration_from_date: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Business authorization
            <input
              type="text"
              value={dppoForm.business_authorization}
              onChange={(e) => setDppoForm((p) => ({ ...p, business_authorization: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Expected tax (Kč)
            <input
              type="text"
              value={dppoForm.expected_tax}
              onChange={(e) => setDppoForm((p) => ({ ...p, expected_tax: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
          <label>
            Signatory birth date
            <input
              type="text"
              value={dppoForm.signatory_birth_date}
              onChange={(e) => setDppoForm((p) => ({ ...p, signatory_birth_date: e.target.value }))}
              disabled={isDppoLoading}
            />
          </label>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showBrowser}
            onChange={(e) => setShowBrowser(e.target.checked)}
            disabled={isDppoLoading}
          />
          Show EPO browser UI and keep it open after finish
        </label>

        <button type="button" onClick={onRunDppo} disabled={isDppoLoading || !successResult}>
          {isDppoLoading ? 'Running DPPO...' : 'Run DPPO and generate XML'}
        </button>

        {dppoResult ? (
          <div className="status">
            {dppoResult.status === 'success'
              ? `XML generated: ${dppoResult.xmlFilePath}`
              : `DPPO error: ${dppoResult.message ?? 'Unknown error'}`}
          </div>
        ) : null}

        <ul>
          {dppoProgress.map((item, index) => (
            <li key={`${item.timestamp}-${index}`}>
              <strong>{item.level}</strong>: {item.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-wide">
        <h2>Full parsed data</h2>
        {!successResult ? (
          <p>Full JSON will appear here after successful extraction.</p>
        ) : (
          <div className="full-data">
            <div className="tab-row">
              <button
                type="button"
                className={`tab-btn ${activeDataTab === 'normalized' ? 'active' : ''}`}
                onClick={() => setActiveDataTab('normalized')}
              >
                Normalized JSON
              </button>
              <button
                type="button"
                className={`tab-btn ${activeDataTab === 'raw' ? 'active' : ''}`}
                onClick={() => setActiveDataTab('raw')}
              >
                Raw JSON
              </button>
              <button
                type="button"
                className={`tab-btn ${activeDataTab === 'mapped' ? 'active' : ''}`}
                onClick={() => setActiveDataTab('mapped')}
              >
                Mapped JSON
              </button>
              <button
                type="button"
                className={`tab-btn ${activeDataTab === 'source' ? 'active' : ''}`}
                onClick={() => setActiveDataTab('source')}
              >
                Source metadata
              </button>
            </div>

            <pre className="json-preview">
              {activeDataTab === 'normalized' && JSON.stringify(successResult.normalizedData, null, 2)}
              {activeDataTab === 'raw' && JSON.stringify(successResult.rawData, null, 2)}
              {activeDataTab === 'mapped' && JSON.stringify(successResult.mappedData ?? {}, null, 2)}
              {activeDataTab === 'source' && JSON.stringify(successResult.source, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </main>
  );
}
