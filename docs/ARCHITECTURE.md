# Local Office Automation Architecture (Stage 1)

## Product Mode
- Runtime mode: fully local desktop app.
- End user mode: no terminal, one-button workflow.
- Automation runtime: Playwright executed in Electron main process, never in renderer.

## Why Main Process for Playwright
- Renderer process is UI-only and must stay responsive.
- Browser automation can block; running it in main process isolates heavy work from UI rendering.
- Main process can safely manage filesystem diagnostics (screenshots, HTML snapshots).
- Future option: move automation into a child process without changing UI contracts (IPC contract is stable).

## Layers
1. UI layer (`src/renderer`)
- Collect IČO input.
- Show progress updates and friendly messages.
- Show preview and stage-2 continue action.

2. Application/orchestration layer (`src/main/app`)
- `FetchCompanyByIcoUseCase` validates input and orchestrates stage-1 flow.
- Emits progress steps for UI.

3. Automation layer (`src/main/modules/justice-company`)
- `justice-company.search.ts`: search by IČO and candidate resolution.
- `justice-company.detail.ts`: open detail extract page.
- `justice-company.extract.ts`: robust label-driven extraction (`dt/dd`, `tr/td`).
- `justice-company.normalize.ts`: canonical output and parsing helpers.
- `justice-company.mapper.ts`: stage-2 draft map with scraped/derived/manual category markers.
- `justice-company.service.ts`: end-to-end automation service and failure diagnostics.

4. Data transformation layer
- Raw source-like data: `JusticeCompanyRawData`.
- Normalized structured data: `JusticeCompanyNormalizedData`.
- Stage-2 draft mapping categories: scraped, derived, manual.

5. Diagnostics layer (`src/main/modules/diagnostics`)
- Structured JSON-line logs.
- Screenshot on failure.
- HTML snapshots for extraction/parse debugging.

## Stage-1 Use Case Contract
`fetchCompanyFromJusticeByIco(ico)` implemented as `FetchCompanyByIcoUseCase.execute(input)`.

Result statuses:
- `success`
- `not_found`
- `multiple_results`
- `parse_error`

Result includes:
- source metadata
- raw scraped data
- normalized data
- optional stage-2 mapped draft

## Business Flow
1. Validate IČO.
2. Open justice.cz search URL.
3. Resolve 0/1/multiple candidates.
4. Open detail extract page (`subjektId`).
5. Extract labeled fields.
6. Normalize into unified JSON.
7. Return result and show preview in UI.

## Error Handling
- User-facing messages are simplified and non-technical.
- Technical diagnostics are stored locally in run-specific directory.
- Parse failures produce screenshot + HTML snapshot for support.

## Packaging Strategy for Office Deployment
Recommended default for internal office tooling:
1. Bundle Electron app with Playwright library.
2. Install Playwright Chromium during packaging/install time for controlled, reproducible runtime.
3. Avoid depending on random system browser versions.

Tradeoff:
- Controlled browser increases installer size.
- Stability and supportability are significantly better for non-technical users.

## Stage-2 Future Integration
`src/main/modules/dppo` is intentionally decoupled.
- Stage 1 produces normalized + mapped draft payload.
- Stage 2 consumes mapped draft and merges manual fields.
- Justice scraping and DPPO submit flows remain independently testable.

## Primary Risks and Mitigations
- Variable address formats: store `full` and parsed subfields; keep parser tolerant.
- Multiple signatories/shareholders: output arrays in normalized schema.
- Site structure changes: label-first extraction and candidate fallback selectors.
- Slow loading: explicit waits and network-idle checks.
- Parse ambiguities: preserve `rawData` and snapshots for remapping/debug.
