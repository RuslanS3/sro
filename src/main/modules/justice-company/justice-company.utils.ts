const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

export function canonicalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[:;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseMoneyCzk(input?: string): number | undefined {
  if (!input) {
    return undefined;
  }

  const digits = input.replace(/\s+/g, '').match(/\d+/g);
  if (!digits) {
    return undefined;
  }

  return Number.parseInt(digits.join(''), 10);
}

export function parsePercent(input?: string): number | undefined {
  if (!input) {
    return undefined;
  }

  const match = input.replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  return Number.parseFloat(match[0]);
}

export function parseMemberCount(input?: string): number | undefined {
  if (!input) {
    return undefined;
  }

  const match = input.match(/\d+/);
  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[0], 10);
}

export function splitName(fullName: string): { first_name?: string; last_name?: string } {
  const clean = fullName.trim();
  if (!clean) {
    return {};
  }

  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0] };
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  };
}

export function splitAddress(address?: string): {
  full: string;
  street?: string;
  house_number?: string;
  orientation_number?: string;
  district?: string;
  zip?: string;
  city?: string;
  country?: string;
} {
  const fallback = {
    full: address ?? '',
    country: 'Česká republika'
  };

  if (!address) {
    return fallback;
  }

  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const first = parts[0] ?? '';
  const houseMatch = first.match(/^(.*)\s+(\d+)(?:\/(\w+))?$/);

  const zipCityPart = parts.find((part) => /\d{3}\s?\d{2}/.test(part));
  const zipCityMatch = zipCityPart?.match(/(\d{3})\s?(\d{2})\s+(.+)/);

  const lastPart = parts[parts.length - 1];
  const hasForeignCountry = lastPart && !/\d/.test(lastPart) && !/praha|brno|ostrava|plzen/i.test(lastPart);

  return {
    full: address,
    street: houseMatch?.[1]?.trim(),
    house_number: houseMatch?.[2],
    orientation_number: houseMatch?.[3],
    district: parts[1] && parts[1] !== zipCityPart ? parts[1] : undefined,
    zip: zipCityMatch ? `${zipCityMatch[1]}${zipCityMatch[2]}` : undefined,
    city: zipCityMatch?.[3]?.trim() ?? (!zipCityPart ? parts[1] : undefined),
    country: hasForeignCountry ? lastPart : 'Česká republika'
  };
}

export function isValidCzechIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) {
    return false;
  }

  const digits = ico.split('').map((d) => Number.parseInt(d, 10));
  const sum = digits.slice(0, 7).reduce((acc, digit, idx) => acc + digit * (8 - idx), 0);
  const mod = sum % 11;

  const check =
    mod === 0 ? 1 :
    mod === 1 ? 0 :
    11 - mod;

  return check === digits[7];
}
