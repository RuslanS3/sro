import type { Locator, Page } from 'playwright';
import type { DppoPayload } from '../types';
import type { DppoLogger } from '../logger';
import { DppoBasePage } from './base.page';
import { CityPickerComponent } from '../components/city-picker.component';
import { toEpoDate } from '../utils/dates';
import { DppoAutomationError } from '../errors';

type TaxSubjectData = DppoPayload['data'];

export class TaxSubjectPage extends DppoBasePage {
  private readonly cityPicker: CityPickerComponent;

  constructor(page: Page, logger: DppoLogger) {
    super(page, logger);
    this.cityPicker = new CityPickerComponent(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectTitleContains('Daňový subjekt - Přihláška k registraci pro právnické osoby');
    await this.ensureVisible('textarea[id$="s_obchjm:i_pole:obchjm"]', 'Tax subject page did not load expected company field.');
    await this.ensureVisible('fieldset#blok_sk_opr_fs', 'Authorized signer section is missing on Tax Subject page.');
  }

  async fill(payload: DppoPayload): Promise<void> {
    const data = payload.data;
    this.logger.log('info', 'Fill tax subject page');
    await this.fillContactInfo(data);
    await this.fillSignerBlocks(data);
  }

  async fillCriticalFields(payload: DppoPayload): Promise<void> {
    const data = payload.data;
    this.logger.log('info', 'Fill critical fields on tax subject page');
    await this.fillSignerBlocks(data);
  }

  private async fillContactInfo(data: TaxSubjectData): Promise<void> {
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
  }

  private async fillSignerBlocks(data: TaxSubjectData): Promise<void> {
    const mode = data.signer_mode ?? 'authorized_person_for_legal_entity';

    if (mode === 'different_signer') {
      this.logger.log('info', 'Signer mode is different_signer: fill upper and lower signer sections');
      await this.fillDifferentSignerSection(data);
    } else {
      this.logger.log('info', 'Signer mode is authorized_person_for_legal_entity: skip upper signer section');
      await this.skipDifferentSignerSection();
    }

    await this.fillAuthorizedPersonSection(data);
  }

  private async fillDifferentSignerSection(data: TaxSubjectData): Promise<void> {
    const section = this.differentSignerSection();
    await section.waitFor({ state: 'visible', timeout: 10_000 });

    const personType = data.signer_person_type ?? 'physical';
    const signerType = personType === 'physical' ? 'F - Fyzická osoba' : 'P - Právnická osoba';
    const signerCode = data.signer_code ?? '1';

    await this.selectInSectionById(section, 'frm:s_zast_typ:i_seznam:zast_typ', signerType);
    await this.selectInSectionById(section, 'frm:s_zast_kod:i_seznam:zast_kod', signerCode);

    if (personType === 'physical') {
      await this.fillInSectionById(section, 'frm:s_zast_prijmeni:i_vstup:zast_prijmeni', data.signatory_last_name);
      await this.fillInSectionById(section, 'frm:s_zast_jmeno:i_vstup:zast_jmeno', data.signatory_first_name);
      if (data.signer_birth_date || data.signatory_birth_date) {
        await this.fillInSectionById(
          section,
          'frm:s_zast_dat_nar:i_datum:zast_dat_nar',
          toEpoDate(data.signer_birth_date ?? data.signatory_birth_date ?? '')
        );
      }
    }
  }

  private async skipDifferentSignerSection(): Promise<void> {
    const section = this.differentSignerSection();
    if (!(await section.isVisible().catch(() => false))) {
      return;
    }

    const typeSelect = section.locator('#frm\\:s_zast_typ\\:i_seznam\\:zast_typ').first();
    if (await typeSelect.isVisible().catch(() => false)) {
      const current = await typeSelect.inputValue().catch(() => '');
      if (current) {
        await typeSelect.selectOption('').catch(() => undefined);
        await typeSelect.dispatchEvent('change').catch(() => undefined);
      }
    }

    await this.clearIfVisible(section, 'frm:s_zast_prijmeni:i_vstup:zast_prijmeni');
    await this.clearIfVisible(section, 'frm:s_zast_jmeno:i_vstup:zast_jmeno');
    await this.clearIfVisible(section, 'frm:s_zast_dat_nar:i_datum:zast_dat_nar');
  }

  private async fillAuthorizedPersonSection(data: TaxSubjectData): Promise<void> {
    const section = this.authorizedPersonSection();
    await section.waitFor({ state: 'visible', timeout: 10_000 });

    this.logger.log('info', 'Fill lower authorized-person signer section');
    await this.fillInSectionById(section, 'frm:s_opr_prijmeni:i_vstup:opr_prijmeni', data.signatory_last_name);
    await this.fillInSectionById(section, 'frm:s_opr_jmeno:i_vstup:opr_jmeno', data.signatory_first_name);

    const relationInput = section.locator('#frm\\:s_opr_postaveni\\:i_ciselnik\\:opr_postaveni').first();
    await relationInput.waitFor({ state: 'visible', timeout: 10_000 });
    await relationInput.click({ force: true });
    await relationInput.fill(data.signatory_relationship);
    await relationInput.dispatchEvent('input').catch(() => undefined);
    await relationInput.dispatchEvent('change').catch(() => undefined);
    await relationInput.press('ArrowDown').catch(() => undefined);
    await this.page.waitForTimeout(200);
    await relationInput.press('Enter').catch(() => undefined);
    await relationInput.press('Tab').catch(() => undefined);
    await this.page.waitForTimeout(250);

    await this.assertInputValue(section, 'frm:s_opr_prijmeni:i_vstup:opr_prijmeni', data.signatory_last_name);
    await this.assertInputValue(section, 'frm:s_opr_jmeno:i_vstup:opr_jmeno', data.signatory_first_name);
    await this.assertNonEmptyInput(section, 'frm:s_opr_postaveni:i_ciselnik:opr_postaveni');
  }

  private differentSignerSection(): Locator {
    return this.page.locator('fieldset#blok_sk_zastupce_fs').first();
  }

  private authorizedPersonSection(): Locator {
    return this.page.locator('fieldset#blok_sk_opr_fs').first();
  }

  private async fillInSectionById(section: Locator, fullId: string, value?: string): Promise<void> {
    if (!value) {
      return;
    }

    const field = section.locator(this.asIdSelector(fullId)).first();
    await field.waitFor({ state: 'visible', timeout: 10_000 });
    await field.click({ force: true });
    await field.fill('');
    await field.type(value, { delay: 20 });
    await field.dispatchEvent('input').catch(() => undefined);
    await field.dispatchEvent('change').catch(() => undefined);
    await field.press('Tab').catch(() => undefined);
    await this.page.waitForTimeout(200);
  }

  private async selectInSectionById(section: Locator, fullId: string, valueOrLabel: string): Promise<void> {
    const select = section.locator(this.asIdSelector(fullId)).first();
    await select.waitFor({ state: 'visible', timeout: 10_000 });

    try {
      await select.selectOption({ label: valueOrLabel });
    } catch {
      await select.selectOption(valueOrLabel);
    }

    await select.dispatchEvent('change').catch(() => undefined);
    await this.page.waitForTimeout(200);
  }

  private async clearIfVisible(section: Locator, fullId: string): Promise<void> {
    const field = section.locator(this.asIdSelector(fullId)).first();
    if (!(await field.isVisible().catch(() => false))) {
      return;
    }

    await field.fill('');
    await field.dispatchEvent('input').catch(() => undefined);
    await field.dispatchEvent('change').catch(() => undefined);
    await field.press('Tab').catch(() => undefined);
  }

  private async assertInputValue(section: Locator, fullId: string, expected: string): Promise<void> {
    const field = section.locator(this.asIdSelector(fullId)).first();
    const value = (await field.inputValue().catch(() => '')).trim();
    if (value.toLowerCase() !== expected.trim().toLowerCase()) {
      throw new DppoAutomationError(`Expected "${fullId}" to equal "${expected}", got "${value}".`, {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }
  }

  private async assertNonEmptyInput(section: Locator, fullId: string): Promise<void> {
    const field = section.locator(this.asIdSelector(fullId)).first();
    const value = (await field.inputValue().catch(() => '')).trim();
    if (!value) {
      throw new DppoAutomationError(`Expected "${fullId}" to be non-empty after fill.`, {
        url: this.page.url(),
        pageTitle: await this.page.title()
      });
    }
  }

  private asIdSelector(fullId: string): string {
    return `#${fullId.replace(/:/g, '\\:')}`;
  }
}

