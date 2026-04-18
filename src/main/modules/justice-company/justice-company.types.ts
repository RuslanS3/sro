import type {
  CompanyCandidate,
  JusticeCompanyRawData,
  SourceMetadata,
  UiProgressEvent
} from '../../../shared/justice-company.contracts';

export type ProgressReporter = (event: UiProgressEvent) => void;

export type SearchResult =
  | {
      status: 'not_found';
      candidates: [];
      source: SourceMetadata;
    }
  | {
      status: 'single_result';
      candidate: CompanyCandidate;
      source: SourceMetadata;
    }
  | {
      status: 'multiple_results';
      candidates: CompanyCandidate[];
      source: SourceMetadata;
    };

export type DetailResult = {
  source: SourceMetadata;
  detailUrl: string;
  rawData: JusticeCompanyRawData;
  htmlSnapshot: string;
};
