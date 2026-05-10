import type { Page } from 'playwright';
import type { DphRegistrationData } from '../dph-registration.types';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationBasePage } from './base.page';

/**
 * "Záhlaví, Plátce" — first form page (`/irs/ph1/zahlavi`).
 *
 * Field IDs verified live on adisspr.mfcr.cz/pmd/epo/podani/.../zahlavi:
 *   - P.c_ufo, P.c_pracufo            tax offices (selects)
 *   - P.dic                           DIČ numeric part
 *   - P.rod_c                         birth number (FO only)
 *   - P.typ_ds                        subject type select
 *   - 03 Typ registrace               radios + checkbox by name="D.typ_platce"
 *                                       value="P" (radio) – pro plátce
 *                                       value="I" (radio) – nebo identifikovanou osobu
 *                                       value="A" (checkbox) – nemá sídlo ani provozovnu v tuzemsku
 *   - P.zkrobchjm                     Obchodní jméno PO
 *   - P.prijmeni / P.rodnepr / P.jmeno / P.titul       FO name parts
 *   - P.ulice / P.c_pop / P.c_orient / P.naz_obce / P.psc / P.stat   sídlo
 *   - A.naz_ul / A.c_dom / A.c_orient / A.naz_obce / A.psc / A.stat  skutečné sídlo
 *   - A.email, A.c_telef                                              kontakt
 *   - P.zmocnenec_doruc, P.id_dats
 *   - "Doplnit" button copies sídlo → skutečné sídlo
 */
export class DphHeaderPage extends DphRegistrationBasePage {
  constructor(page: Page, logger: DphRegistrationLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectUrlSlug('zahlavi');
    await this.ensureVisible(
      '[id="P.c_ufo"]',
      'Header (Záhlaví) page did not load expected tax-office selector.'
    );
    // Wait for the financial-office <select> to actually have its option list
    // populated (Angular loads it async after the DOM appears).
    await this.page
      .waitForFunction(
        () => {
          const el = document.querySelector('[id="P.c_ufo"]') as HTMLSelectElement | null;
          return !!el && el.options && el.options.length > 1;
        },
        null,
        { timeout: 15_000 }
      )
      .catch(() => undefined);
  }

  async fill(data: DphRegistrationData): Promise<void> {
    this.logger.log('info', 'Fill Záhlaví, Plátce');

    // Tax offices.
    await this.selectById('P.c_ufo', data.financial_office);
    await this.selectById('P.c_pracufo', data.territorial_office);

    // 01 DIČ — numeric part only.
    await this.fillById('P.dic', data.dic.replace(/^CZ/i, ''));

    // Rodné číslo for FO.
    if (data.subject_type === 'F' && data.birth_number) {
      await this.fillById('P.rod_c', data.birth_number);
    }

    // Typ daňového subjektu (P / F).
    await this.selectById(
      'P.typ_ds',
      data.subject_type === 'P' ? 'P - Právnická osoba' : 'F - Fyzická osoba'
    );

    // 03 Typ registrace — radios for P/I, checkbox for A.
    await this.applyRegistrationModes(data.registration_modes);

    // 04 Identification.
    if (data.subject_type === 'P') {
      await this.fillById('P.zkrobchjm', data.company_name ?? '');
    } else {
      await this.fillById('P.prijmeni', data.fo_last_name);
      await this.fillById('P.rodnepr', data.fo_birth_last_name);
      await this.fillById('P.jmeno', data.fo_first_name);
      await this.fillById('P.titul', data.fo_title);
    }

    // Sídlo.
    await this.fillById('P.ulice', data.street);
    await this.fillById('P.c_pop', data.house_number);
    await this.fillById('P.c_orient', data.orientation_number);
    await this.fillById('P.naz_obce', data.city);
    await this.fillById('P.psc', data.zip);
    await this.selectById('P.stat', data.country_label);

    // Skutečné sídlo — copy from sídlo via DOPLNIT or fill explicitly.
    if (data.actual_seat_same_as_registered) {
      const ok = await this.copyActualSeat();
      if (!ok) {
        this.logger.log(
          'warn',
          'DOPLNIT did not populate Skutečné sídlo — falling back to manual fill'
        );
        await this.fillActualSeat(data);
      }
    } else {
      await this.fillActualSeat(data);
    }

    // Kontakt.
    await this.fillById('A.email', data.email);
    await this.fillById('A.c_telef', data.phone);

    // Zmocněnec / data box.
    await this.selectById('P.zmocnenec_doruc', data.delivery_proxy_label);
    await this.fillById('P.id_dats', data.foreign_data_box_id);
  }

  /**
   * Click DOPLNIT and verify Skutečné sídlo got populated.
   * Returns true only when at least one A.* field is non-empty after the click.
   */
  private async copyActualSeat(): Promise<boolean> {
    this.logger.log('info', 'Click Doplnit to copy registered → actual seat');

    // Find the button (case-insensitive — text on the live form is "Doplnit").
    const button = this.page
      .locator('button.btn-primary.epo-tlacitko, button:has-text("Doplnit")')
      .filter({ hasText: /Doplnit/i })
      .first();

    if (!(await button.count())) {
      this.logger.log('warn', 'Doplnit button not found in DOM');
      return false;
    }

    await button.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    await button.click({ force: true }).catch(() => undefined);
    await this.page.waitForTimeout(700);

    // Verify A.naz_obce or A.psc was populated.
    const obecValue = await this.byId('A.naz_obce').inputValue().catch(() => '');
    const pscValue = await this.byId('A.psc').inputValue().catch(() => '');
    const ok = !!(obecValue.trim() || pscValue.trim());
    this.logger.log('info', 'Doplnit verification', {
      A_obec: obecValue,
      A_psc: pscValue,
      ok
    });
    return ok;
  }

  private async fillActualSeat(data: DphRegistrationData): Promise<void> {
    this.logger.log('info', 'Fill actual seat (different from registered)');
    await this.fillById('A.naz_ul', data.actual_seat_street ?? data.street);
    await this.fillById('A.c_dom', data.actual_seat_house_number ?? data.house_number);
    await this.fillById(
      'A.c_orient',
      data.actual_seat_orientation_number ?? data.orientation_number
    );
    await this.fillById('A.naz_obce', data.actual_seat_city ?? data.city);
    await this.fillById('A.psc', data.actual_seat_zip ?? data.zip);
    await this.selectById(
      'A.stat',
      data.actual_seat_country_label ?? data.country_label
    );
  }

  private async applyRegistrationModes(
    modes: DphRegistrationData['registration_modes']
  ): Promise<void> {
    const map: Record<DphRegistrationData['registration_modes'][number], string> = {
      'plátce': 'P',
      'identifikovaná_osoba': 'I',
      'bez_sídla_v_tuzemsku': 'A'
    };
    for (const mode of modes) {
      const value = map[mode];
      const ok = await this.checkByNameValue('D.typ_platce', value, true);
      if (!ok) {
        this.logger.log('warn', 'Registration-mode input not found', {
          mode,
          value
        });
      }
    }
  }
}
