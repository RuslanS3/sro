export function toEpoDate(input: string): string {
  const value = input.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    return value;
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  const monthMap: Record<string, string> = {
    ledna: '01',
    unora: '02',
    brezna: '03',
    dubna: '04',
    kvetna: '05',
    cervna: '06',
    cervence: '07',
    srpna: '08',
    zari: '09',
    rijna: '10',
    listopadu: '11',
    prosince: '12'
  };

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const czText = normalized.match(/^(\d{1,2})\.\s*([a-z]+)\s+(\d{4})$/);
  if (czText && monthMap[czText[2]]) {
    return `${czText[1].padStart(2, '0')}.${monthMap[czText[2]]}.${czText[3]}`;
  }

  return value;
}
