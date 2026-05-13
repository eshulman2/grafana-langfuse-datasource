import { SelectableValue } from '@grafana/data';
import { Aggregation, Resource } from './types';

export interface ResourceConfig {
  endpoint: string;
  timestampField: string;
  fromParam: string;
  toParam: string;
  fieldOptions: Array<SelectableValue<string>>;
}

export const RESOURCE_CONFIG: Record<Resource, ResourceConfig> = {
  traces: {
    endpoint: '/api/public/traces',
    timestampField: 'timestamp',
    fromParam: 'fromUpdatedAt',
    toParam: 'toUpdatedAt',
    fieldOptions: [
      { label: 'Total Cost', value: 'totalCost' },
      { label: 'Latency (s)', value: 'latency' },
    ],
  },
  observations: {
    endpoint: '/api/public/observations',
    timestampField: 'startTime',
    fromParam: 'fromStartTime',
    toParam: 'toStartTime',
    fieldOptions: [
      { label: 'Total Cost', value: 'totalCost' },
      { label: 'Total Tokens', value: 'usageDetails.total' },
      { label: 'Input Tokens', value: 'usageDetails.input' },
      { label: 'Output Tokens', value: 'usageDetails.output' },
    ],
  },
  scores: {
    endpoint: '/api/public/scores',
    timestampField: 'timestamp',
    fromParam: 'fromTimestamp',
    toParam: 'toTimestamp',
    fieldOptions: [
      { label: 'Score Value', value: 'value' },
    ],
  },
};

export const RESOURCE_OPTIONS: Array<SelectableValue<Resource>> = [
  { label: 'Traces', value: 'traces' },
  { label: 'Observations', value: 'observations' },
  { label: 'Scores', value: 'scores' },
];

export const AGGREGATION_OPTIONS: Array<SelectableValue<Aggregation>> = [
  { label: 'Sum', value: 'sum' },
  { label: 'Average', value: 'avg' },
  { label: 'Count', value: 'count' },
];
