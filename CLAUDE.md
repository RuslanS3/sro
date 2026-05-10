# CLAUDE.md — Working Rules for Agents on `varv`

This file is a contract between the user and any AI agent working on this repo.
Read it BEFORE making any changes. If something here conflicts with a user request,
ask the user — do not silently override.

---

## 1. What this project is

`varv` is a **local desktop office automation tool** built on Electron + React + TypeScript,
using Playwright to drive Czech government e-form portals (mainly EPO / mojedaně /
adisspr.mfcr.cz / justice.cz). The goal is one-click workflows for non-technical office users.

Existing modules:

- `src/main/modules/justice-company` — scrape company data from justice.cz by IČO.
- `src/main/modules/dppo` — automate filling and exporting the corporate income tax form (DPPO).
- `src/main/modules/diagnostics` — structured logs, screenshots, HTML snapshots.

New modules are expected to follow the same patterns. See `docs/ARCHITECTURE.md` for
the canonical Stage-1 description.

---

## 2. Architectural rules (do not violate)

1. **Playwright runs in the Electron main process only.** Never import `playwright` from
   `src/renderer/**`. The renderer is UI-only and must stay responsive.
2. **IPC contracts live in `src/shared/`.** Both main and renderer import the same `*.contracts.ts`
   files. Add new contracts there, not inline in modules.
3. **Page Object Model for every submit-flow.** Each form page must be a class extending
   `DppoBasePage`-style abstract base: `assertLoaded()`, `fill(payload)`, `next()`.
   Reuse helpers from `pages/base.page.ts` (`fillInputByIdSuffix`, `selectByIdSuffix`, etc.).
4. **Long-running automations emit progress.** Use case layer (`src/main/app/use-cases`)
   exposes a step stream so the UI can show stage messages. Do not block the renderer.
5. **Diagnostics on failure are mandatory.** On any thrown error in an automation flow,
   take a fullPage screenshot, log structured JSON, and surface a non-technical message
   to the UI plus the screenshot path.
6. **Outputs go to `~/Downloads/<flow>/<sanitized-folder>/`** by default. Folder name is
   sanitized from company name or identifier. Allow override via options.
7. **Cookie banners are dismissed via shared util** (`utils/epo-ui.ts` — `dismissCookieBanner`).
   Always call it before the first interaction on each navigation.
8. **Locators prefer `id$="..."` suffix matching** over absolute IDs — EPO IDs have long
   generated prefixes that change per submission.
9. **No top-level `await` in modules**, no global Playwright instances. Each submit call
   creates its own browser/context and closes them in `finally` (unless `keepBrowserOpen`).
10. **Result objects are tagged unions** (`status: 'success' | 'not_found' | ... | 'error'`).
    Never throw across the IPC boundary. Convert to a result.

---

## 3. Code style

- TypeScript strict; explicit return types on exported functions.
- Module file naming: `kebab-case.suffix.ts` where suffix is one of
  `service`, `mapper`, `extract`, `normalize`, `errors`, `types`, `logger`, `utils`,
  `*.page`, `*.component`.
- Comments and log messages in **English**, even though target sites are Czech.
- Czech form labels (titles, button values, field labels) are kept in original Czech in
  code, since they are matched against the actual DOM.
- Errors use a module-specific subclass of `Error` (e.g., `DppoAutomationError`) with
  optional context: `{ url, pageTitle, ... }`.
- Logger is **injected**, never imported as a singleton. Default `ConsoleXxxLogger`.

---

## 4. How to add a new submit-form module

When asked to "add a module that fills form X":

1. Confirm with user: target portal URL, identifier, what artifacts to produce
   (XML for data box, PDF, both).
2. Create folder `src/main/modules/<form-id>/` with:
   - `<form-id>.types.ts` — payload + options + result types.
   - `errors.ts` — `<FormId>AutomationError`.
   - `logger.ts` — interface + console implementation (or reuse if shared logger exists).
   - `pages/base.page.ts` — abstract base (or reuse from dppo if generalized).
   - `pages/*.page.ts` — one class per form step.
   - `utils/` — date formatting, downloads, helpers specific to this form.
   - `submit-<form-id>.ts` — top-level pipeline that orchestrates pages.
3. Add an IPC channel and contract in `src/shared/<form-id>.contracts.ts`.
4. Wire it through `src/main/electron/ipc.ts` and `preload.ts`.
5. Add a button + progress UI in `src/renderer/`.
6. Add a use case in `src/main/app/use-cases/` if the flow needs orchestration with
   other modules (e.g., justice-company → form X).

---

## 5. What NOT to do

- Do **not** press final-submission buttons (`ODESLAT PODÁNÍ`, `Submit`, etc.) unless
  the user explicitly asked for end-to-end submission. Stop at downloading artifacts.
- Do **not** install new npm packages without asking. The project deliberately keeps
  dependencies minimal (Electron, React, Playwright, dev tooling only).
- Do **not** add tests/CI/lint configs the user did not request.
- Do **not** create `README.md` files unless explicitly asked.
- Do **not** silently change `tsconfig.*.json` paths or build scripts.
- Do **not** put real credentials or test IČO/DIČ values in committed code. Use the
  payload passed by the user.

---

## 6. Communication

- The user often writes in **Ukrainian**. Reply in Ukrainian unless asked otherwise.
- Czech UI strings must stay verbatim (selectors, button values).
- Before code: present a short plan (files to create, signatures, risks). Wait for
  confirmation. Only then implement.
- After code: report what was changed, where, and how to run/verify.

---

## 7. Verification before declaring "done"

For any change touching code:

1. `npm run build:main` should pass (TS strict).
2. `npm run build:renderer` should pass.
3. New IPC contracts must be referenced from BOTH main and renderer.
4. No `playwright` import in any file under `src/renderer/`.
5. Diffs reviewed end-to-end by the agent itself before sign-off.

---

_Last updated: 2026-05-09_
