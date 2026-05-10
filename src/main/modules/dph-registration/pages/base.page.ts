import type { Locator, Page } from 'playwright';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationAutomationError } from '../errors';
import { dismissCookieBanner } from '../utils/epo-ui';

/**
 * Abstract base page for the VAT (DPH) registration form.
 *
 * The portal is an Angular SPA (mat-mdc-* classes). All form-field IDs are
 * stable and namespaced per section:
 *   - "P.*"   header / registered seat / identification + signature subjects
 *   - "A.*"   actual seat + contact
 *   - "E.*"   Registrační údaje (page 2)
 *   - "U.*"   Bankovní účty list (page 3)
 *   - "UV.*"  Účet pro vrácení (page 3)
 *   - other fields use plain camelCase IDs (notificationEmail, zpravaHtml, fileDropRef)
 *
 * IMPORTANT: ID values contain dots (e.g. "P.dic"). CSS `#P.dic` treats `.dic`
 * as a class selector; always use `[id="P.dic"]` form via `byId()` below.
 *
 * Page navigation uses the visible button "DALŠÍ STRÁNKA >". Clicks are SPA
 * routes — we wait for the URL slug to change via `waitForUrlSlug()`.
 */
export abstract class DphRegistrationBasePage {
  protected constructor(
    protected readonly page: Page,
    protected readonly logger: DphRegistrationLogger
  ) {}

  abstract assertLoaded(): Promise<void>;

  /** Match an element by its exact id, even when the id contains dots. */
  protected byId(id: string): Locator {
    return this.page.locator(`[id="${id}"]`).first();
  }

  protected async expectUrlSlug(slug: string, timeoutMs = 30_000): Promise<void> {
    await this.page.waitForURL(new RegExp(`/${slug}(?:\\?|$|/)`), { timeout: timeoutMs });
  }

  protected async expectTitleContains(expected: string): Promise<void> {
    await this.page.waitForFunction(
      (value) => document.title.includes(value),
      expected,
      { timeout: 30_000 }
    );
  }

  /**
   * Click "DALŠÍ STRÁNKA >" navigation. The button text on the live portal
   * contains a trailing " >", and the click drives an Angular router. Wait
   * for the URL to leave the current slug.
   */
  async next(currentSlug?: string): Promise<void> {
    this.logger.log('info', 'Click DALŠÍ STRÁNKA');
    await dismissCookieBanner(this.page);

    const slugBefore = currentSlug ?? this.currentSlug();

    const nextButton = this.findNextPageButton();
    await nextButton.click();

    await this.page
      .waitForFunction(
        (slug) => !location.pathname.endsWith('/' + slug),
        slugBefore,
        { timeout: 30_000 }
      )
      .catch(() => undefined);
    // Give Angular a moment to settle.
    await this.page.waitForTimeout(400);
  }

  protected findNextPageButton(): Locator {
    // The visible button text is "DALŠÍ STRÁNKA >" with the chevron.
    const a = this.page.locator('button:has-text("DALŠÍ STRÁNKA")').first();
    return a;
  }

  protected currentSlug(): string {
    const m = this.page.url().match(/\/irs\/ph1\/([^?#/]+)/);
    return m ? m[1] : '';
  }

  /**
   * Fill an <input> by exact id. Empty/undefined values are skipped silently
   * to keep call sites concise. Reads back the value after fill and logs a
   * warning if the write didn't take (Angular SPA quirks).
   *
   * Always scrolls the element into view first — without this, fields below
   * the fold (e.g. signature block on `/prilohy` at y=1190px) sometimes
   * silently fail to receive input.
   */
  protected async fillById(id: string, value: string | undefined): Promise<boolean> {
    if (value === undefined || value === null || value === '') return false;
    await dismissCookieBanner(this.page);
    const input = this.byId(id);
    if (!(await input.count())) {
      this.logger.log('warn', 'Input element not found in DOM', { id });
      return false;
    }
    await input.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    if (!(await input.isVisible().catch(() => false))) {
      this.logger.log('warn', 'Input not visible — skipping', { id });
      return false;
    }
    await input.click({ delay: 30 }).catch(() => undefined);
    await input.fill('').catch(() => undefined);
    await input.fill(value);
    // Trigger Angular change detection.
    await input
      .evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      })
      .catch(() => undefined);

    // Verify the value was written.
    const actual = await input.inputValue().catch(() => '');
    if (actual !== value) {
      this.logger.log('warn', 'Input value did not stick after fill', {
        id,
        expected: value,
        actual
      });
    }
    return true;
  }

  /**
   * Fill a <textarea> by exact id. Same semantics as `fillById`.
   */
  protected async fillTextareaById(id: string, value: string | undefined): Promise<boolean> {
    if (value === undefined || value === null || value === '') return false;
    await dismissCookieBanner(this.page);
    const ta = this.byId(id);
    if (!(await ta.isVisible().catch(() => false))) return false;
    await ta.fill(value);
    await ta.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => undefined);
    return true;
  }

  /**
   * Pick a <select> option by visible label or value. Tries:
   *   1. exact label match  (e.g. "HLAVNÍ MĚSTO PRAHA")
   *   2. exact value match  (e.g. "451")
   *   3. case-insensitive partial label match  (e.g. user typed "Praha")
   * Logs available options when nothing matches, then returns false.
   */
  protected async selectById(
    id: string,
    valueOrLabel: string | undefined
  ): Promise<boolean> {
    if (!valueOrLabel) return false;
    await dismissCookieBanner(this.page);
    const select = this.byId(id);
    if (!(await select.count())) {
      this.logger.log('warn', 'Select not found in DOM', { id });
      return false;
    }
    await select.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    if (!(await select.isVisible().catch(() => false))) {
      this.logger.log('warn', 'Select not visible — skipping', { id });
      return false;
    }

    // Some Angular Material selects lazy-load their options on first focus /
    // click. Touch the select to trigger that, then wait until options
    // arrive. We give it up to 15s — country (P.stat) has ~250 options.
    await select.click({ delay: 30 }).catch(() => undefined);
    // Close the dropdown right back so it doesn't intercept later clicks.
    await this.page.keyboard.press('Escape').catch(() => undefined);

    const optionsReady = await this.page
      .waitForFunction(
        (selectId) => {
          const el = document.querySelector(`[id="${selectId}"]`) as HTMLSelectElement | null;
          return !!el && el.options && el.options.length > 1;
        },
        id,
        { timeout: 15_000 }
      )
      .then(() => true)
      .catch(() => false);

    if (!optionsReady) {
      this.logger.log('warn', 'Select options never loaded', { id });
      return false;
    }

    let picked: string | null = null;
    try {
      await select.selectOption({ label: valueOrLabel });
      picked = `label=${valueOrLabel}`;
    } catch {
      try {
        await select.selectOption(valueOrLabel);
        picked = `value=${valueOrLabel}`;
      } catch {
        // Case-insensitive label match: exact, then prefix, then contains.
        const matchedValue = await select
          .evaluate((el, target) => {
            const sel = el as HTMLSelectElement;
            const norm = (s: string): string =>
              s
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .trim()
                .toLowerCase();
            const t = norm(target);
            // 1. exact
            for (const o of Array.from(sel.options)) {
              if (norm(o.textContent || '') === t) return o.value;
            }
            // 2. starts with
            for (const o of Array.from(sel.options)) {
              const ot = norm(o.textContent || '');
              if (ot && t && ot.startsWith(t)) return o.value;
            }
            // 3. contains
            for (const o of Array.from(sel.options)) {
              const ot = norm(o.textContent || '');
              if (ot && t && ot.includes(t)) return o.value;
            }
            return null;
          }, valueOrLabel)
          .catch(() => null);
        if (matchedValue) {
          await select.selectOption(matchedValue).catch(() => undefined);
          picked = `value=${matchedValue} (fuzzy match)`;
        }
      }
    }

    if (!picked) {
      const sample = await select
        .evaluate((el) =>
          Array.from((el as HTMLSelectElement).options)
            .slice(0, 8)
            .map((o) => `${o.value}=${(o.textContent || '').trim()}`)
        )
        .catch(() => [] as string[]);
      const totalOptions = await select
        .evaluate((el) => (el as HTMLSelectElement).options.length)
        .catch(() => 0);
      this.logger.log('warn', 'Select option not found', {
        id,
        valueOrLabel,
        totalOptions,
        firstOptions: sample
      });
      return false;
    }

    await select
      .evaluate((el) => {
        const element = el as HTMLSelectElement;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
      })
      .catch(() => undefined);
    await this.page.waitForTimeout(200);

    // Verify the value was actually applied.
    const actualValue = await select
      .evaluate((el) => (el as HTMLSelectElement).value)
      .catch(() => '');
    this.logger.log('info', 'Select set', { id, picked, actualValue });
    return true;
  }

  /**
   * Click a button by its visible text. Multiple text candidates are tried in
   * order (useful when EPO sometimes uses upper- and lowercase variants).
   */
  protected async clickButtonByText(...texts: string[]): Promise<boolean> {
    await dismissCookieBanner(this.page);
    for (const text of texts) {
      const candidates: Locator[] = [
        this.page.getByRole('button', { name: text, exact: true }).first(),
        this.page.locator(`button:has-text("${text.replace(/"/g, '\\"')}")`).first()
      ];
      for (const candidate of candidates) {
        if (await candidate.isVisible().catch(() => false)) {
          await candidate.click({ force: true });
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Set checkbox / radio that has a `name` and `value` attribute (the form
   * uses these for "03 Typ registrace" without per-element IDs).
   */
  protected async checkByNameValue(
    name: string,
    value: string,
    checked: boolean
  ): Promise<boolean> {
    await dismissCookieBanner(this.page);
    const el = this.page
      .locator(`input[name="${name}"][value="${value}"]`)
      .first();
    if (!(await el.count())) return false;
    const isChecked = await el.isChecked().catch(() => false);
    if (isChecked === checked) return true;
    await el.click({ force: true });
    return true;
  }

  protected async ensureVisible(selector: string, message: string): Promise<void> {
    const locator = this.page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      throw new DphRegistrationAutomationError(message, {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }
  }
}
