import type {
  JusticeCompanyNormalizedData,
  JusticeCompanyRawData,
  Person,
  Shareholder
} from '../../../shared/justice-company.contracts';
import { parseMemberCount, parseMoneyCzk, parsePercent, splitAddress, splitName } from './justice-company.utils';

function splitFileAndCourt(fileNumberWithCourt?: string): { file_number?: string; court?: string } {
  if (!fileNumberWithCourt) {
    return {};
  }

  const match = fileNumberWithCourt.match(/^(.*?)\s+veden[áa]\s+u\s+(.*)$/i);
  if (!match) {
    return { file_number: fileNumberWithCourt };
  }

  return {
    file_number: match[1].trim(),
    court: match[2].trim()
  };
}

function parseBusinessActivities(text?: string): string[] {
  if (!text) {
    return [];
  }

  return text
    .split(/\n|,\s*(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/živnosti volné|přílohách|předmět podnikání/i.test(line));
}

function parseNamedPersons(text?: string): Person[] {
  if (!text) {
    return [];
  }

  const normalized = text.replace(/\r/g, '');
  const matches = Array.from(normalized.matchAll(/([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\- ]{2,}),\s*dat\.\s*nar\.\s*([^\n,]+)([\s\S]*?)(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\- ]{2,},\s*dat\.\s*nar\.|$)/g));

  const strictPeople = matches.map((match) => {
    const fullName = match[1].trim();
    const birthDate = match[2].trim();
    const tail = match[3]?.trim() ?? '';

    const addressLine = tail
      .split(/\n|\./)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^Den vzniku funkce:/i.test(line));

    const functionStartDate = tail.match(/Den vzniku funkce:\s*([^\n]+)/i)?.[1]?.trim();
    const nameParts = splitName(fullName);

    return {
      full_name: fullName,
      first_name: nameParts.first_name,
      last_name: nameParts.last_name,
      birth_date: birthDate,
      address: addressLine ? splitAddress(addressLine) : undefined,
      function_start_date: functionStartDate
    };
  });

  if (strictPeople.length > 0) {
    return strictPeople;
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const isLikelyName = (line: string): boolean => {
    if (/^(jednatel|člen|předseda|společník)\s*:$/i.test(line)) {
      return false;
    }

    if (/den vzniku funkce|dat\.\s*nar\./i.test(line)) {
      return false;
    }

    if (!/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ'`\- ]+$/.test(line)) {
      return false;
    }

    return line.split(/\s+/).length >= 2;
  };

  const isLikelyAddress = (line?: string): boolean => {
    if (!line) {
      return false;
    }

    return /\d|,|ukrajina|republika|praha|brno|ostrava|plzeň|boscoreale/i.test(line);
  };

  const fallbackPeople: Person[] = [];
  const globalFunctionStartDate = normalized.match(/Den vzniku funkce:\s*([^\n]+)/i)?.[1]?.trim();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isLikelyName(line)) {
      continue;
    }

    const nameParts = splitName(line);
    const next = lines[index + 1];

    fallbackPeople.push({
      full_name: line,
      first_name: nameParts.first_name,
      last_name: nameParts.last_name,
      address: isLikelyAddress(next) ? splitAddress(next) : undefined,
      function_start_date: globalFunctionStartDate
    });
  }

  return fallbackPeople;
}

function parseShareholders(shareholdersText?: string, shareText?: string): Shareholder[] {
  const people = parseNamedPersons(shareholdersText);
  if (people.length === 0) {
    return [];
  }

  const depositText = shareText?.match(/Vklad:\s*([^\n]+)/i)?.[1]?.trim();
  const paidText = shareText?.match(/Splaceno:\s*([^\n]+)/i)?.[1]?.trim();
  const ownershipText = shareText?.match(/Obchodní podíl:\s*([^\n]+)/i)?.[1]?.trim();

  return people.map((person) => ({
    ...person,
    share: {
      deposit_amount_czk: parseMoneyCzk(depositText),
      deposit_amount_text: depositText,
      paid_percent: parsePercent(paidText),
      ownership_percent: parsePercent(ownershipText)
    }
  }));
}

export class JusticeCompanyNormalizeService {
  normalize(rawData: JusticeCompanyRawData): JusticeCompanyNormalizedData {
    const fileData = splitFileAndCourt(rawData.fileNumberWithCourt);
    const statutoryRole = rawData.statutoryBody?.split(':')[0]?.trim();
    const normalizedIco = rawData.ico?.replace(/\D/g, '');

    return {
      registration_date: rawData.registrationDate,
      file_number: fileData.file_number,
      court: fileData.court,
      company_name: rawData.companyName,
      address: splitAddress(rawData.address),
      ico: normalizedIco || rawData.ico,
      legal_form: rawData.legalForm,
      business_activities: parseBusinessActivities(rawData.businessActivities),
      statutory_body: {
        role: statutoryRole,
        persons: parseNamedPersons(rawData.statutoryBody),
        member_count: parseMemberCount(rawData.memberCount),
        acting_method: rawData.actingMethod
      },
      shareholders: parseShareholders(rawData.shareholders, rawData.share),
      basic_capital: {
        amount_czk: parseMoneyCzk(rawData.basicCapital),
        amount_text: rawData.basicCapital
      }
    };
  }
}
