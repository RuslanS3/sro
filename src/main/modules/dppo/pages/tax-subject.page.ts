import type { Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { CityPickerComponent } from '../components/city-picker.component';
import { toEpoDate } from '../utils/dates';
import { DppoAutomationError } from '../errors';

export class TaxSubjectPage extends DppoBasePage {
  private readonly cityPicker: CityPickerComponent;

  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
    this.cityPicker = new CityPickerComponent(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Daňový subjekt - Přihláška k registraci pro právnické osoby');
    await this.ensureVisible('textarea[id$="s_obchjm:i_pole:obchjm"]', 'Tax subject page did not load expected company field.');
  }

  async fill(payload: DppoPayload): Promise<void> {
    const data = payload.data;

    this.logger.log('info', 'Fill tax subject page');
    await this.fillTextareaByIdSuffix('s_obchjm:i_pole:obchjm', data.company_name);
    await this.fillInputByIdSuffix('s_ico:i_vstup:ico', data.ico);
    await this.fillInputByIdSuffix('s_naz_ul:i_vstup:naz_ul', data.street);
    await this.fillInputByIdSuffix('s_c_dom:i_vstup:c_dom', data.house_number);
    await this.fillInputByIdSuffix('s_c_orient:i_vstup:c_orient', data.orientation_number);

    await this.cityPicker.pickCity(data.city_input, data.zip);

    await this.fillInputByIdSuffix('s_psc:i_vstup:psc', data.zip);
    await this.fillInputByIdSuffix('s_stat:i_vstupSeznam:stat', data.country_label);

    if (data.phone) {
      await this.fillInputByIdSuffix('s_c_telefS:i_vstup:c_telefS', data.phone);
    }

    if (data.email) {
      await this.fillInputByIdSuffix('s_emailS:i_vstup:emailS', data.email);
    }

    await this.selectByIdSuffix('s_zast_typ:i_seznam:zast_typ', 'F - Fyzická osoba');
    await this.selectByIdSuffix('s_zast_kod:i_seznam:zast_kod', '1');
    await this.waitForRepresentativeFieldsReady();
    await this.forceFillInputByIdSuffix('s_zast_prijmeni:i_vstup:zast_prijmeni', data.signatory_last_name);
    await this.forceFillInputByIdSuffix('s_zast_jmeno:i_vstup:zast_jmeno', data.signatory_first_name);
    if (data.signatory_birth_date) {
      await this.fillInputByIdSuffix('s_zast_dat_nar:i_datum:zast_dat_nar', toEpoDate(data.signatory_birth_date));
    }

    // Some EPO variants validate representative names from the "opr_*" group.
    await this.forceFillInputByIdSuffix('s_opr_prijmeni:i_vstup:opr_prijmeni', data.signatory_last_name);
    await this.forceFillInputByIdSuffix('s_opr_jmeno:i_vstup:opr_jmeno', data.signatory_first_name);
    await this.fillInputByIdSuffix('s_opr_postaveni:i_ciselnik:opr_postaveni', data.signatory_relationship);
    await this.assertRepresentativeFilled(data.signatory_last_name, data.signatory_first_name);
  }

  async fillCriticalFields(payload: DppoPayload): Promise<void> {
    const data = payload.data;
    this.logger.log('info', 'Fill critical fields on tax subject page');

    await this.fillTextareaByIdSuffix('s_obchjm:i_pole:obchjm', data.company_name);
    await this.selectByIdSuffix('s_zast_typ:i_seznam:zast_typ', 'F - Fyzická osoba');
    await this.selectByIdSuffix('s_zast_kod:i_seznam:zast_kod', '1');
    await this.waitForRepresentativeFieldsReady();
    await this.forceFillInputByIdSuffix('s_zast_prijmeni:i_vstup:zast_prijmeni', data.signatory_last_name);
    await this.forceFillInputByIdSuffix('s_zast_jmeno:i_vstup:zast_jmeno', data.signatory_first_name);
    if (data.signatory_birth_date) {
      await this.fillInputByIdSuffix('s_zast_dat_nar:i_datum:zast_dat_nar', toEpoDate(data.signatory_birth_date));
    }
    await this.forceFillInputByIdSuffix('s_opr_prijmeni:i_vstup:opr_prijmeni', data.signatory_last_name);
    await this.forceFillInputByIdSuffix('s_opr_jmeno:i_vstup:opr_jmeno', data.signatory_first_name);
    await this.fillInputByIdSuffix('s_opr_postaveni:i_ciselnik:opr_postaveni', data.signatory_relationship);
    await this.assertRepresentativeFilled(data.signatory_last_name, data.signatory_first_name);
  }

  private async forceFillInputByIdSuffix(idSuffix: string, value?: string): Promise<void> {
    if (!value) {
      return;
    }

    const locator = this.page.locator(`input[id$="${idSuffix}"]`).first();
    if (!(await locator.isVisible().catch(() => false))) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await locator.fill(value);
      await locator.evaluate((el) => {
        const input = el as HTMLInputElement;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      }).catch(() => undefined);
      await locator.press('Tab').catch(() => undefined);
      await this.page.waitForTimeout(250);

      const readback = await locator.inputValue().catch(() => '');
      if (readback.trim() === value.trim()) {
        return;
      }
    }
  }

  private async waitForRepresentativeFieldsReady(): Promise<void> {
    await this.page
      .waitForFunction(() => {
        const block = document.getElementById('frm:blok_sk_zastupce_fo');
        const lastName = document.getElementById('frm:s_zast_prijmeni:i_vstup:zast_prijmeni') as HTMLInputElement | null;
        const firstName = document.getElementById('frm:s_zast_jmeno:i_vstup:zast_jmeno') as HTMLInputElement | null;
        return (
          !!block &&
          getComputedStyle(block).display !== 'none' &&
          !!lastName &&
          !lastName.disabled &&
          !!firstName &&
          !firstName.disabled
        );
      }, undefined, { timeout: 15_000 })
      .catch(() => undefined);
  }

  private async assertRepresentativeFilled(lastName: string, firstName: string): Promise<void> {
    const last = this.page.locator('input[id$="s_zast_prijmeni:i_vstup:zast_prijmeni"]').first();
    const first = this.page.locator('input[id$="s_zast_jmeno:i_vstup:zast_jmeno"]').first();
    await this.page.waitForTimeout(250);

    const lastValue = (await last.inputValue().catch(() => '')).trim();
    const firstValue = (await first.inputValue().catch(() => '')).trim();
    if (!lastValue || !firstValue) {
      throw new DppoAutomationError('Representative first/last name was not persisted on Tax Subject page.', {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }

    if (lastName && lastValue.toLowerCase() !== lastName.trim().toLowerCase()) {
      throw new DppoAutomationError('Representative last name differs from payload after fill.', {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }

    if (firstName && firstValue.toLowerCase() !== firstName.trim().toLowerCase()) {
      throw new DppoAutomationError('Representative first name differs from payload after fill.', {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }
  }
}
