import type { Stage2MappedData } from '../../../shared/justice-company.contracts';
import type { DppoPayload } from './types';

export type DppoSubmissionInput = {
  mappedData: Stage2MappedData;
  manualFields: Record<string, string>;
  payload?: DppoPayload;
};

export type DppoSubmissionResult = {
  status: 'queued' | 'submitted' | 'failed' | 'error';
  message: string;
  xmlFilePath?: string;
  screenshotPath?: string;
};
