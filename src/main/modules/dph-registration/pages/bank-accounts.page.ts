import type { Page } from 'playwright';
import type { DphBankAccount, DphRegistrationData } from '../dph-registration.types';
import type { DphRegistrationLogger } from '../logger';
import { DphRegistrationBasePage } from './base.page';

/**
 * "Bankovní účty, Účet pro vrácení" — page 3 (`/irs/ph1/ucty`).
 *
 * Field IDs verified live:
 *   List 11 (per page list, 1 account each):
 *     U.poradi_uctu (display only)
 *     U.typ_uctu       (select)
 *     U.predcisli      (input)
 *     U.c_uctu         (input)
 *     U.k_bank         (input)
 *     U.verejny        (select — určen ke zveřejnění)
 *
 *   Refund account 11a:
 *     UV.typ_uctu / UV.predcisli / UV.c_uctu / UV.k_bank
 *
 * Pagination buttons (text-based):
 *   << / < / List i/N / > / >> / PŘIDAT LIST / ODEBRAT LIST
 */
export class DphBankAccountsPage extends DphRegistrationBasePage {
  constructor(page: Page, logger: DphRegistrationLogger) {
    super(page, logger);
  }

  async assertLoaded(): Promise<void> {
    await this.expectUrlSlug('ucty');
  }

  async fill(data: DphRegistrationData): Promise<void> {
    this.logger.log('info', 'Fill Bankovní účty', {
      accountsCount: data.bank_accounts.length,
      hasRefund: Boolean(data.refund_account)
    });

    await this.fillBankAccountsList(data.bank_accounts);

    if (data.refund_account) {
      await this.fillRefundAccount(data.refund_account);
    }
  }

  private async fillBankAccountsList(accounts: DphBankAccount[]): Promise<void> {
    if (accounts.length === 0) return;

    for (let i = 0; i < accounts.length; i += 1) {
      if (i > 0) {
        const added = await this.clickButtonByText('Přidat list', 'PŘIDAT LIST');
        if (!added) {
          this.logger.log('warn', 'Could not add bank-account list page', { index: i });
          break;
        }
        // Step to the new list (it usually becomes active automatically).
        await this.page.waitForTimeout(300);
      }

      await this.fillBankAccountFields(accounts[i]);
    }
  }

  private async fillBankAccountFields(account: DphBankAccount): Promise<void> {
    await this.selectById('U.typ_uctu', account.account_type);
    await this.fillById('U.predcisli', account.prefix);
    await this.fillById('U.c_uctu', account.number);
    await this.fillById('U.k_bank', account.bank_code);
    const publish = account.publish_in_public_register !== false;
    await this.selectById('U.verejny', publish ? 'A - Ano' : 'N - Ne');
  }

  private async fillRefundAccount(account: DphBankAccount): Promise<void> {
    this.logger.log('info', 'Fill refund account (11a)');
    await this.selectById('UV.typ_uctu', account.account_type);
    await this.fillById('UV.predcisli', account.prefix);
    await this.fillById('UV.c_uctu', account.number);
    await this.fillById('UV.k_bank', account.bank_code);
  }
}
