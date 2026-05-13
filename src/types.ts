import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type QueryType =
  | 'trace_cost'
  | 'trace_latency'
  | 'trace_count'
  | 'observation_tokens'
  | 'observation_cost'
  | 'custom';

export type Resource = 'traces' | 'observations' | 'scores';

export type Aggregation = 'sum' | 'avg' | 'count';

export interface LangfuseQuery extends DataQuery {
  queryType?: QueryType;
  // Custom query fields — only used when queryType === 'custom'
  resource?: Resource;
  field?: string;
  aggregation?: Aggregation;
}

export interface LangfuseOptions extends DataSourceJsonData {
  // URL is stored in instanceSettings.url (Grafana standard field).
  // Public key and secret key use Grafana's built-in basicAuth fields.
  // No custom jsonData fields needed for v1.
}

// Langfuse API response shapes
export interface LangfuseTrace {
  id: string;
  timestamp: string;
  updatedAt: string;
  totalCost: number | null;
  latency: number | null;
}

export interface LangfuseObservation {
  id: string;
  startTime: string;
  totalCost: number | null;
  usageDetails: {
    input: number;
    output: number;
    total: number;
  } | null;
}

export interface LangfuseScore {
  id: string;
  traceId: string;
  observationId: string | null;
  timestamp: string;
  value: number | null;
  name: string;
  dataType: string;
}

export interface LangfusePage<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
