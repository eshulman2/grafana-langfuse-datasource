import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type QueryType =
  | 'trace_cost'
  | 'trace_latency'
  | 'trace_count'
  | 'observation_tokens'
  | 'observation_cost';

export interface LangfuseQuery extends DataQuery {
  queryType: QueryType;
}

export interface LangfuseOptions extends DataSourceJsonData {
  // URL is stored in instanceSettings.url (Grafana standard field).
  // Public key and secret key use Grafana's built-in basicAuth fields.
  // No custom jsonData fields needed for v1.
}

// Langfuse API response shapes
export interface LangfuseTrace {
  id: string;
  timestamp: string;       // ISO 8601 — when the trace was created
  updatedAt: string;       // ISO 8601 — last update
  totalCost: number | null;
  latency: number | null;  // seconds (float)
}

export interface LangfuseObservation {
  id: string;
  startTime: string;       // ISO 8601
  totalCost: number | null;
  usageDetails: {
    input: number;
    output: number;
    total: number;
  } | null;
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
