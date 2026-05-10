import type { Page } from 'playwright';
import type { DphRegistrationData, DphEuRegistrationRow } from '../dph-registration.types';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationBasePage } from './base.page';
import { toEpoDate } from '../utils/dates';
import { pickRandomVoluntaryReason } from '../../../../shared/dph-voluntary-reasons';

/**
 * "Registrační údaje" — page 2 (`/irs/ph1/reg_udaje`).
 *
 * Field IDs verified live (E.* prefix):
 *   - E.d_pov_reg          05 Datum rozhodného dne
 *   - E.duvreg             06 Důvod registrace (select)
 *   - E.obrat12            07 Obrat
 *   - E.d_zrusreg_p        08 Datum zrušení předchozí registrace
 *   - E.duv_zrusreg_p      Důvod zrušení
 *   - E.duv_dobrreg        09 Důvod dobrovolné registrace
 *   - E.obrat_dobr         09a Předpokládaná částka ročního obratu
 *   - 10 Registrace v jiných státech: E.k_stat (select), E.zahrid (text), E.d_reg_eu (date)
 *     The form has only the first row visible; "Přidat řádek" adds more (IDs may
 *     change for additional rows — first row uses bare IDs, others may be indexed).
 *   - E.eori, E.ex_id_number
 */
export class DphRegistrationDataPage extends DphRegistrationBasePage {
  constructor(page: Page, logger: DphRegistrationLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectUrlSlug('reg_udaje');
    await this.ensureVisible(
      '[id="E.duv_dobrreg"]',
      'Registrační údaje page did not load expected fields.'
    );
  }

  async fill(data: DphRegistrationData): Promise<void> {
    this.logger.log('info', 'Fill Registrační údaje');

    if (data.decisive_date) {
      await this.fillById('E.d_pov_reg', toEpoDate(data.decisive_date));
    }

    await this.selectById('E.duvreg', data.registration_reason_label);

    await this.fillById('E.obrat12', data.turnover);

    if (data.previous_registration_cancel_date) {
      await this.fillById(
        'E.d_zrusreg_p',
        toEpoDate(data.previous_registration_cancel_date)
      );
    }
    await this.fillById('E.duv_zrusreg_p', data.previous_registration_cancel_reason);

    // Field "09 Důvod dobrovolné registrace" — random fallback pool.
    const voluntaryReason =
      data.voluntary_registration_reason &&
      data.voluntary_registration_reason.trim().length > 0
        ? data.voluntary_registration_reason
        : pickRandomVoluntaryReason();
    await this.fillById('E.duv_dobrreg', voluntaryReason);

    await this.fillById('E.obrat_dobr', data.expected_annual_turnover);

    if (data.eu_registrations && data.eu_registrations.length > 0) {
      await this.fillEuRegistrations(data.eu_registrations);
    }

    await this.fillById('E.eori', data.eori);
    await this.fillById('E.ex_id_number', data.sme_identifier);
  }

  private async fillEuRegistrations(rows: DphEuRegistrationRow[]): Promise<void> {
    this.logger.log('info', 'Fill EU registrations table', { count: rows.length });

    // First row uses bare E.* IDs.
    if (rows[0]) {
      await this.selectById('E.k_stat', rows[0].state);
      await this.fillById('E.zahrid', rows[0].eu_vat_id);
      if (rows[0].registration_date) {
        await this.fillById('E.d_reg_eu', toEpoDate(rows[0].registration_date));
      }
    }

    // Additional rows: best-effort. The form likely renders indexed IDs for
    // dynamically added rows (e.g. E.k_stat_1, E.k_stat_2 or similar). Until
    // we verify on the live form, we add rows but skip filling extras and
    // log a warning so the user can complete them manually.
    for (let i = 1; i < rows.length; i += 1) {
      const added = await this.clickButtonByText('Přidat řádek', 'PŘIDAT ŘÁDEK');
      if (!added) {
        this.logger.log('warn', 'Could not add EU registration row', { index: i });
        return;
      }
      this.logger.log('warn', 'Additional EU rows are not auto-filled in this version', {
        rowIndex: i,
        suggestedManualFill: rows[i]
      });
    }
  }
}
