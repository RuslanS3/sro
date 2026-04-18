import type { Stage2MappedData } from '../../../shared/justice-company.contracts';

export class DppoMapper {
  mergeManualFields(mappedData: Stage2MappedData, manualFields: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = {};

    for (const [key, descriptor] of Object.entries(mappedData.data)) {
      const manual = manualFields[key];
      merged[key] = manual ?? (descriptor.value != null ? String(descriptor.value) : '');
    }

    return merged;
  }
}
