import type { Page } from 'playwright';
import type { JusticeCompanyRawData } from '../../../shared/justice-company.contracts';
import { canonicalizeLabel } from './justice-company.utils';

function pickLabel(map: Record<string, string>, aliases: string[]): string | undefined {
  const normalizedMap = new Map<string, string>();
  for (const [key, value] of Object.entries(map)) {
    normalizedMap.set(canonicalizeLabel(key), value);
  }

  for (const alias of aliases) {
    const exact = normalizedMap.get(canonicalizeLabel(alias));
    if (exact) {
      return exact;
    }
  }

  for (const [key, value] of normalizedMap.entries()) {
    if (aliases.some((alias) => key.includes(canonicalizeLabel(alias)))) {
      return value;
    }
  }

  return undefined;
}

export class JusticeCompanyExtractService {
  async extractRawData(page: Page): Promise<{ rawData: JusticeCompanyRawData; htmlSnapshot: string }> {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(700);

    const extracted = await page.evaluate(() => {
      const clean = (value?: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();
      const cleanBlock = (value?: string | null): string =>
        (value ?? '')
          .split('\n')
          .map((line) => line.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n');
      const labelMap: Record<string, string> = {};

      const dtNodes = Array.from(document.querySelectorAll('dt'));
      for (const dt of dtNodes) {
        const label = clean(dt.textContent);
        const dd = dt.nextElementSibling?.tagName.toLowerCase() === 'dd'
          ? dt.nextElementSibling
          : dt.parentElement?.querySelector('dd');
        if (label && dd) {
          labelMap[label] = clean(dd.textContent);
        }
      }

      const rows = Array.from(document.querySelectorAll('tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('th, td'));
        if (cells.length < 2) {
          continue;
        }

        const label = clean(cells[0]?.textContent);
        const value = clean(cells.slice(1).map((cell) => cell.textContent ?? '').join(' '));
        if (label && value && !labelMap[label]) {
          labelMap[label] = value;
        }
      }

      const divRows = Array.from(document.querySelectorAll('.div-table .div-row'));
      for (const row of divRows) {
        const cells = Array.from(row.querySelectorAll(':scope > .div-cell'));
        if (cells.length < 2) {
          continue;
        }

        const label = clean(cells[0]?.querySelector('.nounderline')?.textContent ?? cells[0]?.textContent);
        const valueNode = cells[1] as HTMLElement | undefined;
        const value = cleanBlock(valueNode?.innerText ?? valueNode?.textContent);

        if (label && value && !labelMap[label]) {
          labelMap[label] = value;
        }
      }

      const html = document.documentElement.outerHTML;
      const bodyText = cleanBlock(document.body.innerText ?? document.body.textContent);

      return { labelMap, html, bodyText };
    });

    const labelMap = extracted.labelMap;

    const rawData: JusticeCompanyRawData = {
      sourceUrl: page.url(),
      extractedAt: new Date().toISOString(),
      labelMap,
      bodyText: extracted.bodyText,
      registrationDate: pickLabel(labelMap, ['Datum vzniku a zápisu', 'Datum vzniku']),
      fileNumberWithCourt: pickLabel(labelMap, ['Spisová značka']),
      companyName: pickLabel(labelMap, ['Obchodní firma', 'Firma']),
      address: pickLabel(labelMap, ['Sídlo']),
      ico: pickLabel(labelMap, ['Identifikační číslo', 'IČO']),
      legalForm: pickLabel(labelMap, ['Právní forma']),
      businessActivities: pickLabel(labelMap, ['Předmět podnikání']),
      statutoryBody: pickLabel(labelMap, ['Statutární orgán']),
      memberCount: pickLabel(labelMap, ['Počet členů']),
      actingMethod: pickLabel(labelMap, ['Způsob jednání']),
      shareholders: pickLabel(labelMap, ['Společníci', 'Společník']),
      share: pickLabel(labelMap, ['Podíl']),
      basicCapital: pickLabel(labelMap, ['Základní kapitál'])
    };

    return {
      rawData,
      htmlSnapshot: extracted.html
    };
  }
}
