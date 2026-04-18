import type { Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { CityPickerComponent } from '../components/city-picker.component';

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
    await this.fillInputByIdSuffix('s_zast_prijmeni:i_vstup:zast_prijmeni', data.signatory_last_name);
    await this.fillInputByIdSuffix('s_zast_jmeno:i_vstup:zast_jmeno', data.signatory_first_name);
    await this.fillInputByIdSuffix('s_opr_postaveni:i_ciselnik:opr_postaveni', data.signatory_relationship);
  }
}
