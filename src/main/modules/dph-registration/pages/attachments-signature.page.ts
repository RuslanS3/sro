import path from 'node:path';
import fs from 'node:fs';
import type { Page } from 'playwright';
import type { DphRegistrationData, DphSignatureBlock } from '../dph-registration.types';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationBasePage } from './base.page';
import { toEpoDate } from '../utils/dates';

/**
 * "Jiné přílohy, Podpisová doložka" — page 4 (`/irs/ph1/prilohy`).
 *
 * IDs verified live:
 *   fileDropRef                 file input
 *   zpravaHtml                  textarea — Textová příloha (poznámka)
 *
 *   Signature block (top — optional context-dependent fields):
 *     P.zast_typ          select   Typ podepisující osoby
 *     P.zast_kod          select   Kód podepisující osoby
 *     P.zast_jmeno        input    Jméno (a)
 *     P.zast_prijmeni     input    Příjmení
 *     P.zast_nazev        input    Název právnické osoby
 *     P.zast_dat_nar      input    Datum narození
 *     P.zast_ev_cislo     input    Evidenční číslo osvědčení daňového poradce
 *     P.zast_ic           input    IČ právnické osoby
 *
 *   Authorized FO block (bottom — always required):
 *     P.opr_jmeno         input    Jméno
 *     P.opr_prijmeni      input    Příjmení
 *     P.opr_postaveni     input    Vztah k právnické osobě
 */
export class DphAttachmentsSignaturePage extends DphRegistrationBasePage {
  constructor(page: Page, logger: DphRegistrationLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectUrlSlug('prilohy');
    // Wait for the signature fields to be attached to the DOM. They render
    // far below the fold (≈ y=1190px) so we can't rely on viewport visibility.
    await this.page
      .waitForSelector('[id="P.opr_jmeno"]', { state: 'attached', timeout: 15_000 })
      .catch(() => undefined);
    await this.page
      .waitForSelector('[id="P.opr_prijmeni"]', { state: 'attached', timeout: 5_000 })
      .catch(() => undefined);
  }

  async fill(data: DphRegistrationData): Promise<void> {
    this.logger.log('info', 'Fill Jiné přílohy + Podpisová doložka');

    if (data.attachments && data.attachments.length > 0) {
      await this.uploadAttachments(data.attachments);
    }

    if (data.text_attachment) {
      await this.fillTextareaById('zpravaHtml', data.text_attachment);
    }

    // Scroll to the very bottom so Angular renders any lazy parts and the
    // signature block enters the viewport. Then fill.
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(400);

    await this.fillSignatureBlock(data.signature);

    // Verify lower block landed.
    const verify = async (id: string): Promise<string> =>
      this.byId(id).inputValue().catch(() => '');
    const opJmeno = await verify('P.opr_jmeno');
    const opPrijmeni = await verify('P.opr_prijmeni');
    const opPostaveni = await verify('P.opr_postaveni');
    this.logger.log('info', 'Signature lower block verification', {
      'P.opr_jmeno': opJmeno,
      'P.opr_prijmeni': opPrijmeni,
      'P.opr_postaveni': opPostaveni
    });

    // One retry pass for any field that didn't stick. Angular sometimes
    // doesn't accept the very first write right after a route transition.
    if (!opJmeno && data.signature.authorized_first_name) {
      this.logger.log('warn', 'Retrying P.opr_jmeno fill');
      await this.fillById('P.opr_jmeno', data.signature.authorized_first_name);
    }
    if (!opPrijmeni && data.signature.authorized_last_name) {
      this.logger.log('warn', 'Retrying P.opr_prijmeni fill');
      await this.fillById('P.opr_prijmeni', data.signature.authorized_last_name);
    }
    if (!opPostaveni && data.signature.authorized_relationship) {
      this.logger.log('warn', 'Retrying P.opr_postaveni fill');
      await this.fillById('P.opr_postaveni', data.signature.authorized_relationship);
    }
  }

  private async uploadAttachments(paths: string[]): Promise<void> {
    const existing = paths.filter((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
    if (existing.length === 0) {
      this.logger.log('warn', 'No attachment files exist on disk; skipping upload');
      return;
    }
    this.logger.log('info', 'Upload attachments', { count: existing.length });

    const fileInput = this.byId('fileDropRef');
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(existing);
      return;
    }

    this.logger.log('warn', 'fileDropRef input not found', {
      attemptedPaths: existing.map((p) => path.basename(p))
    });
  }

  private async fillSignatureBlock(signature: DphSignatureBlock): Promise<void> {
    // Upper signer block — optional.
    await this.selectById('P.zast_typ', signature.signer_type_label);
    await this.selectById('P.zast_kod', signature.signer_code_label);
    await this.fillById('P.zast_jmeno', signature.signer_first_name);
    await this.fillById('P.zast_prijmeni', signature.signer_last_name);
    await this.fillById('P.zast_nazev', signature.signer_legal_entity_name);

    if (signature.signer_birth_date) {
      await this.fillById('P.zast_dat_nar', toEpoDate(signature.signer_birth_date));
    }

    await this.fillById('P.zast_ev_cislo', signature.signer_advisor_certificate_number);
    await this.fillById('P.zast_ic', signature.signer_legal_entity_ico);

    // Lower required block — physical person authorised to sign.
    await this.fillById('P.opr_jmeno', signature.authorized_first_name);
    await this.fillById('P.opr_prijmeni', signature.authorized_last_name);
    await this.fillById('P.opr_postaveni', signature.authorized_relationship);
  }
}
