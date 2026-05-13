# Flexible Query Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Grafana Langfuse datasource plugin with a `custom` query mode that lets dashboard authors pick any resource (traces, observations, scores), any numeric field via dot-notation, and any aggregation — without requiring plugin code changes for each new metric.

**Architecture:** A new `queryType: 'custom'` value is added as the discriminator. When selected, three new fields on `LangfuseQuery` — `resource`, `field`, `aggregation` — drive a dynamic fetch using existing `fetchAllPages` and `bucketByTime` utilities. A new `getNestedValue(obj, path)` utility extracts dot-notation paths (e.g. `usageDetails.total`) from raw API records. Resource endpoint/field/param metadata lives in a new `src/resourceConfig.ts` so both `datasource.ts` and `QueryEditor.tsx` share a single source of truth. The five existing fixed query types are untouched.

**Tech Stack:** TypeScript, React, `@grafana/data`, `@grafana/ui`, Jest — same as the existing plugin. Branch: `feature/flexible-query-builder`.

---

## File Map

| File | Change |
|---|---|
| `src/types.ts` | Add `Resource`, `Aggregation` types; add `'custom'` to `QueryType`; add `resource?`, `field?`, `aggregation?` to `LangfuseQuery`; add `LangfuseScore` |
| `src/resourceConfig.ts` | **New** — `RESOURCE_CONFIG`, `RESOURCE_OPTIONS`, `AGGREGATION_OPTIONS` constants |
| `src/utils.ts` | Add exported `getNestedValue(obj, path)` |
| `src/__tests__/utils.test.ts` | Add tests for `getNestedValue` |
| `src/datasource.ts` | Add `'custom'` case to `runQuery`; add `queryCustom` private method; import `getNestedValue` and `RESOURCE_CONFIG` |
| `src/__tests__/datasource.test.ts` | Add tests for `queryCustom` with all 3 resources |
| `src/components/QueryEditor.tsx` | Add mode toggle (Fixed / Custom); custom mode renders Resource + Field + Aggregation dropdowns |

---

## Task 1: Extend types and create resourceConfig

**Files:**
- Modify: `src/types.ts`
- Create: `src/resourceConfig.ts`

- [ ] **Step 1: Replace `src/types.ts`**

```typescript
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
```

- [ ] **Step 2: Create `src/resourceConfig.ts`**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
cd ~/git/grafana-langfuse-datasource
git add src/types.ts src/resourceConfig.ts
git commit -m "feat: add Resource/Aggregation types, custom queryType, resourceConfig"
```

---

## Task 2: Add getNestedValue utility (TDD)

**Files:**
- Modify: `src/__tests__/utils.test.ts`
- Modify: `src/utils.ts`

- [ ] **Step 1: Add failing tests for `getNestedValue`**

Append to the end of `src/__tests__/utils.test.ts`:

```typescript
import { getNestedValue } from '../utils';

describe('getNestedValue', () => {
  it('returns a top-level numeric field', () => {
    expect(getNestedValue({ totalCost: 0.05 }, 'totalCost')).toBe(0.05);
  });

  it('returns a nested numeric field via dot-notation', () => {
    expect(getNestedValue({ usageDetails: { total: 150 } }, 'usageDetails.total')).toBe(150);
  });

  it('returns null when the top-level field is missing', () => {
    expect(getNestedValue({}, 'totalCost')).toBeNull();
  });

  it('returns null when an intermediate field is missing', () => {
    expect(getNestedValue({}, 'usageDetails.total')).toBeNull();
  });

  it('returns null when the value is null', () => {
    expect(getNestedValue({ totalCost: null }, 'totalCost')).toBeNull();
  });

  it('returns null when the value is a string, not a number', () => {
    expect(getNestedValue({ name: 'test' }, 'name')).toBeNull();
  });

  it('returns zero when the value is 0', () => {
    expect(getNestedValue({ value: 0 }, 'value')).toBe(0);
  });

  it('returns null when an intermediate node is null', () => {
    expect(getNestedValue({ usageDetails: null }, 'usageDetails.total')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/git/grafana-langfuse-datasource
npm run test -- --watchAll=false --testPathPattern="utils"
```

Expected: FAIL — `getNestedValue` is not exported from `../utils`.

- [ ] **Step 3: Add `getNestedValue` to `src/utils.ts`**

Append to the end of `src/utils.ts`:

```typescript
export function getNestedValue(obj: Record<string, unknown>, path: string): number | null {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'number') {
    return current;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/git/grafana-langfuse-datasource
npm run test -- --watchAll=false --testPathPattern="utils"
```

Expected: All tests pass (16 existing + 8 new = 24 utils tests).

- [ ] **Step 5: Commit**

```bash
cd ~/git/grafana-langfuse-datasource
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "feat: add getNestedValue dot-notation field extractor with tests"
```

---

## Task 3: Add custom query handler to datasource (TDD)

**Files:**
- Modify: `src/__tests__/datasource.test.ts`
- Modify: `src/datasource.ts`

- [ ] **Step 1: Add failing tests for `queryCustom`**

Append to the end of `src/__tests__/datasource.test.ts` (after the existing describe blocks):

```typescript
describe('LangfuseDatasource.query — custom mode', () => {
  let ds: LangfuseDatasource;

  beforeEach(() => {
    jest.clearAllMocks();
    ds = new LangfuseDatasource(makeInstanceSettings());
  });

  it('fetches traces and returns a frame with dynamic label for traces/totalCost/sum', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 't1', timestamp: '2024-01-01T01:00:00Z', totalCost: 0.05, latency: 1.0 },
    ]);

    const options = {
      targets: [{ queryType: 'custom', resource: 'traces', field: 'totalCost', aggregation: 'sum', refId: 'A', hide: false }],
      range: {
        from: dateTime('2024-01-01T00:00:00Z'),
        to: dateTime('2024-01-02T00:00:00Z'),
        raw: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' },
      },
      requestId: 'test', timezone: 'UTC', scopedVars: {}, startTime: 0,
    } as any;

    const result = await ds.query(options);
    expect(result.data).toHaveLength(1);
    const frame = result.data[0];
    expect(frame.fields[0].name).toBe('time');
    expect(frame.fields[1].name).toBe('traces / totalCost (sum)');
  });

  it('fetches observations for observations resource', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 'o1', startTime: '2024-01-01T01:00:00Z', usageDetails: { input: 100, output: 50, total: 150 } },
    ]);

    const options = {
      targets: [{ queryType: 'custom', resource: 'observations', field: 'usageDetails.total', aggregation: 'sum', refId: 'A', hide: false }],
      range: {
        from: dateTime('2024-01-01T00:00:00Z'),
        to: dateTime('2024-01-02T00:00:00Z'),
        raw: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' },
      },
      requestId: 'test', timezone: 'UTC', scopedVars: {}, startTime: 0,
    } as any;

    const result = await ds.query(options);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].fields[1].name).toBe('observations / usageDetails.total (sum)');
    expect(mockFetchAllPages).toHaveBeenCalledWith(
      '/api/datasources/proxy/1/langfuse',
      '/api/public/observations',
      expect.any(Object)
    );
  });

  it('fetches scores for scores resource', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 's1', timestamp: '2024-01-01T01:00:00Z', value: 0.9 },
    ]);

    const options = {
      targets: [{ queryType: 'custom', resource: 'scores', field: 'value', aggregation: 'avg', refId: 'A', hide: false }],
      range: {
        from: dateTime('2024-01-01T00:00:00Z'),
        to: dateTime('2024-01-02T00:00:00Z'),
        raw: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' },
      },
      requestId: 'test', timezone: 'UTC', scopedVars: {}, startTime: 0,
    } as any;

    const result = await ds.query(options);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].fields[1].name).toBe('scores / value (avg)');
    expect(mockFetchAllPages).toHaveBeenCalledWith(
      '/api/datasources/proxy/1/langfuse',
      '/api/public/scores',
      expect.any(Object)
    );
  });

  it('uses correct time params for each resource', async () => {
    mockFetchAllPages.mockResolvedValue([]);

    const makeCustomOptions = (resource: string) => ({
      targets: [{ queryType: 'custom', resource, field: 'totalCost', aggregation: 'sum', refId: 'A', hide: false }],
      range: {
        from: dateTime('2024-01-01T00:00:00Z'),
        to: dateTime('2024-01-02T00:00:00Z'),
        raw: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' },
      },
      requestId: 'test', timezone: 'UTC', scopedVars: {}, startTime: 0,
    } as any);

    await ds.query(makeCustomOptions('traces'));
    expect(mockFetchAllPages).toHaveBeenCalledWith(
      expect.any(String),
      '/api/public/traces',
      expect.objectContaining({ fromUpdatedAt: expect.any(String), toUpdatedAt: expect.any(String) })
    );

    jest.clearAllMocks();
    mockFetchAllPages.mockResolvedValue([]);
    await ds.query(makeCustomOptions('scores'));
    expect(mockFetchAllPages).toHaveBeenCalledWith(
      expect.any(String),
      '/api/public/scores',
      expect.objectContaining({ fromTimestamp: expect.any(String), toTimestamp: expect.any(String) })
    );
  });

  it('defaults to traces/totalCost/sum when fields are missing', async () => {
    mockFetchAllPages.mockResolvedValue([]);

    const options = {
      targets: [{ queryType: 'custom', refId: 'A', hide: false }],
      range: {
        from: dateTime('2024-01-01T00:00:00Z'),
        to: dateTime('2024-01-02T00:00:00Z'),
        raw: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' },
      },
      requestId: 'test', timezone: 'UTC', scopedVars: {}, startTime: 0,
    } as any;

    const result = await ds.query(options);
    expect(result.data[0].fields[1].name).toBe('traces / totalCost (sum)');
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
cd ~/git/grafana-langfuse-datasource
npm run test -- --watchAll=false --testPathPattern="datasource"
```

Expected: The 5 new `custom mode` tests fail — `'custom'` falls through to the default empty frame.

- [ ] **Step 3: Update `src/datasource.ts`**

Replace the full file content:

```typescript
import {
  DataSourceApi,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  FieldType,
  MutableDataFrame,
} from '@grafana/data';
import { LangfuseQuery, LangfuseOptions, LangfuseTrace, LangfuseObservation } from './types';
import { fetchAllPages, bucketByTime, getNestedValue } from './utils';
import { RESOURCE_CONFIG } from './resourceConfig';

export class LangfuseDatasource extends DataSourceApi<LangfuseQuery, LangfuseOptions> {
  private readonly proxyUrl: string;

  constructor(instanceSettings: DataSourceInstanceSettings<LangfuseOptions>) {
    super(instanceSettings);
    this.proxyUrl = `${instanceSettings.url}/langfuse`;
  }

  async query(options: DataQueryRequest<LangfuseQuery>): Promise<DataQueryResponse> {
    const { range, targets } = options;
    const from = range.from.valueOf();
    const to = range.to.valueOf();
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    const data = await Promise.all(
      targets
        .filter((t) => !t.hide && t.queryType)
        .map((t) => this.runQuery(t, from, to, fromIso, toIso))
    );

    return { data };
  }

  private async runQuery(
    target: LangfuseQuery,
    from: number,
    to: number,
    fromIso: string,
    toIso: string
  ): Promise<MutableDataFrame> {
    switch (target.queryType) {
      case 'trace_cost':
        return this.queryTraceCost(target.refId, from, to, fromIso, toIso);
      case 'trace_latency':
        return this.queryTraceLatency(target.refId, from, to, fromIso, toIso);
      case 'trace_count':
        return this.queryTraceCount(target.refId, from, to, fromIso, toIso);
      case 'observation_tokens':
        return this.queryObservationTokens(target.refId, from, to, fromIso, toIso);
      case 'observation_cost':
        return this.queryObservationCost(target.refId, from, to, fromIso, toIso);
      case 'custom':
        return this.queryCustom(target, from, to, fromIso, toIso);
      default:
        return new MutableDataFrame({ refId: target.refId, fields: [] });
    }
  }

  private async queryCustom(
    target: LangfuseQuery,
    from: number,
    to: number,
    fromIso: string,
    toIso: string
  ): Promise<MutableDataFrame> {
    const resource = target.resource ?? 'traces';
    const field = target.field ?? 'totalCost';
    const aggregation = target.aggregation ?? 'sum';
    const config = RESOURCE_CONFIG[resource];

    const records = await fetchAllPages<Record<string, unknown>>(
      this.proxyUrl,
      config.endpoint,
      { [config.fromParam]: fromIso, [config.toParam]: toIso }
    );

    const timestamps = records.map((r) => String(r[config.timestampField] ?? ''));
    const values = aggregation === 'count'
      ? records.map(() => null)
      : records.map((r) => getNestedValue(r, field));

    const { times, values: bucketValues } = bucketByTime(timestamps, values, from, to, aggregation);
    const label = `${resource} / ${field} (${aggregation})`;
    return toFrame(target.refId, label, FieldType.number, times, bucketValues);
  }

  private async queryTraceCost(refId: string, from: number, to: number, fromIso: string, toIso: string) {
    const traces = await fetchAllPages<LangfuseTrace>(this.proxyUrl, '/api/public/traces', {
      fromUpdatedAt: fromIso,
      toUpdatedAt: toIso,
    });
    const { times, values } = bucketByTime(
      traces.map((t) => t.timestamp),
      traces.map((t) => t.totalCost),
      from, to, 'sum'
    );
    return toFrame(refId, 'Total Cost (USD)', FieldType.number, times, values);
  }

  private async queryTraceLatency(refId: string, from: number, to: number, fromIso: string, toIso: string) {
    const traces = await fetchAllPages<LangfuseTrace>(this.proxyUrl, '/api/public/traces', {
      fromUpdatedAt: fromIso,
      toUpdatedAt: toIso,
    });
    const { times, values } = bucketByTime(
      traces.map((t) => t.timestamp),
      traces.map((t) => t.latency),
      from, to, 'avg'
    );
    return toFrame(refId, 'Avg Latency (s)', FieldType.number, times, values);
  }

  private async queryTraceCount(refId: string, from: number, to: number, fromIso: string, toIso: string) {
    const traces = await fetchAllPages<LangfuseTrace>(this.proxyUrl, '/api/public/traces', {
      fromUpdatedAt: fromIso,
      toUpdatedAt: toIso,
    });
    const { times, values } = bucketByTime(
      traces.map((t) => t.timestamp),
      traces.map(() => null),
      from, to, 'count'
    );
    return toFrame(refId, 'Trace Volume', FieldType.number, times, values);
  }

  private async queryObservationTokens(refId: string, from: number, to: number, fromIso: string, toIso: string) {
    const observations = await fetchAllPages<LangfuseObservation>(
      this.proxyUrl, '/api/public/observations',
      { fromStartTime: fromIso, toStartTime: toIso }
    );
    const { times, values } = bucketByTime(
      observations.map((o) => o.startTime),
      observations.map((o) => o.usageDetails?.total ?? 0),
      from, to, 'sum'
    );
    return toFrame(refId, 'Total Tokens', FieldType.number, times, values);
  }

  private async queryObservationCost(refId: string, from: number, to: number, fromIso: string, toIso: string) {
    const observations = await fetchAllPages<LangfuseObservation>(
      this.proxyUrl, '/api/public/observations',
      { fromStartTime: fromIso, toStartTime: toIso }
    );
    const { times, values } = bucketByTime(
      observations.map((o) => o.startTime),
      observations.map((o) => o.totalCost),
      from, to, 'sum'
    );
    return toFrame(refId, 'Observation Cost (USD)', FieldType.number, times, values);
  }

  async testDatasource(): Promise<{ status: string; message: string }> {
    try {
      await fetchAllPages(this.proxyUrl, '/api/public/traces', {});
      return { status: 'success', message: 'Connected to Langfuse successfully' };
    } catch (err) {
      return { status: 'error', message: `Failed to connect: ${String(err)}` };
    }
  }
}

function toFrame(
  refId: string,
  name: string,
  type: FieldType,
  times: number[],
  values: number[]
): MutableDataFrame {
  return new MutableDataFrame({
    refId,
    fields: [
      { name: 'time', type: FieldType.time, values: times },
      { name, type, values },
    ],
  });
}
```

- [ ] **Step 4: Run all tests**

```bash
cd ~/git/grafana-langfuse-datasource
npm run test -- --watchAll=false --testPathPattern="."
```

Expected: All tests pass (24 utils + 15 datasource = 39 total).

- [ ] **Step 5: Commit**

```bash
cd ~/git/grafana-langfuse-datasource
git add src/datasource.ts src/__tests__/datasource.test.ts
git commit -m "feat: add custom query handler for all 3 resources with TDD"
```

---

## Task 4: Update QueryEditor

**Files:**
- Modify: `src/components/QueryEditor.tsx`

- [ ] **Step 1: Replace `src/components/QueryEditor.tsx`**

```tsx
import React from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Select, InlineField, InlineFieldRow } from '@grafana/ui';
import { LangfuseDatasource } from '../datasource';
import { Aggregation, LangfuseOptions, LangfuseQuery, QueryType, Resource } from '../types';
import { AGGREGATION_OPTIONS, RESOURCE_CONFIG, RESOURCE_OPTIONS } from '../resourceConfig';

const FIXED_QUERY_TYPE_OPTIONS: Array<SelectableValue<QueryType>> = [
  { label: 'Cost (traces)', value: 'trace_cost', description: 'Sum of LLM cost per time bucket' },
  { label: 'Latency (traces)', value: 'trace_latency', description: 'Average trace latency per time bucket' },
  { label: 'Volume (traces)', value: 'trace_count', description: 'Number of traces per time bucket' },
  { label: 'Token usage (observations)', value: 'observation_tokens', description: 'Total tokens (input + output) per time bucket' },
  { label: 'Cost (observations)', value: 'observation_cost', description: 'Sum of observation cost per time bucket' },
];

const MODE_OPTIONS: Array<SelectableValue<'fixed' | 'custom'>> = [
  { label: 'Fixed metric', value: 'fixed' },
  { label: 'Custom query', value: 'custom' },
];

type Props = QueryEditorProps<LangfuseDatasource, LangfuseQuery, LangfuseOptions>;

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const isCustom = query.queryType === 'custom';
  const currentResource: Resource = query.resource ?? 'traces';

  const onModeChange = (selected: SelectableValue<'fixed' | 'custom'>) => {
    if (selected.value === 'custom') {
      onChange({
        ...query,
        queryType: 'custom',
        resource: query.resource ?? 'traces',
        field: query.field ?? 'totalCost',
        aggregation: query.aggregation ?? 'sum',
      });
    } else {
      onChange({ ...query, queryType: undefined });
    }
    onRunQuery();
  };

  const onFixedQueryTypeChange = (selected: SelectableValue<QueryType>) => {
    onChange({ ...query, queryType: selected.value! });
    onRunQuery();
  };

  const onResourceChange = (selected: SelectableValue<Resource>) => {
    const resource = selected.value!;
    const firstField = RESOURCE_CONFIG[resource].fieldOptions[0]?.value ?? 'totalCost';
    onChange({ ...query, resource, field: firstField });
    onRunQuery();
  };

  const onFieldChange = (selected: SelectableValue<string>) => {
    onChange({ ...query, field: selected.value! });
    onRunQuery();
  };

  const onAggregationChange = (selected: SelectableValue<Aggregation>) => {
    onChange({ ...query, aggregation: selected.value! });
    onRunQuery();
  };

  return (
    <>
      <InlineFieldRow>
        <InlineField label="Mode" labelWidth={12}>
          <Select
            options={MODE_OPTIONS}
            value={isCustom ? 'custom' : 'fixed'}
            onChange={onModeChange}
            width={18}
          />
        </InlineField>
        {!isCustom && (
          <InlineField label="Metric" labelWidth={10}>
            <Select
              options={FIXED_QUERY_TYPE_OPTIONS}
              value={query.queryType}
              onChange={onFixedQueryTypeChange}
              placeholder="Select metric..."
              width={32}
            />
          </InlineField>
        )}
      </InlineFieldRow>
      {isCustom && (
        <InlineFieldRow>
          <InlineField label="Resource" labelWidth={12}>
            <Select
              options={RESOURCE_OPTIONS}
              value={currentResource}
              onChange={onResourceChange}
              width={18}
            />
          </InlineField>
          <InlineField label="Field" labelWidth={8}>
            <Select
              options={RESOURCE_CONFIG[currentResource].fieldOptions}
              value={query.field ?? RESOURCE_CONFIG[currentResource].fieldOptions[0]?.value}
              onChange={onFieldChange}
              width={26}
            />
          </InlineField>
          <InlineField label="Aggregation" labelWidth={14}>
            <Select
              options={AGGREGATION_OPTIONS}
              value={query.aggregation ?? 'sum'}
              onChange={onAggregationChange}
              width={14}
            />
          </InlineField>
        </InlineFieldRow>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/git/grafana-langfuse-datasource
git add src/components/QueryEditor.tsx
git commit -m "feat: add mode toggle and custom query UI to QueryEditor"
```

---

## Task 5: Build, full test run, and push

**Files:** None — verification only.

- [ ] **Step 1: Run all tests**

```bash
cd ~/git/grafana-langfuse-datasource
npm run test -- --watchAll=false --testPathPattern="."
```

Expected: All 39 tests pass across 2 suites.

- [ ] **Step 2: Build the plugin**

```bash
cd ~/git/grafana-langfuse-datasource
npm run build
```

Expected: webpack compiles successfully, no TypeScript errors, `dist/` updated.

- [ ] **Step 3: Restart Grafana to pick up the new build**

```bash
cd ~/git/grafana-langfuse-datasource
podman compose --env-file .env -f devtools/compose.grafana.yml restart
```

Wait 10 seconds, then open http://localhost:3001, add a new panel, select the Langfuse datasource, and verify the Mode dropdown shows "Fixed metric" / "Custom query". Switching to Custom query should reveal Resource / Field / Aggregation dropdowns.

- [ ] **Step 4: Push branch and create PR**

```bash
cd ~/git/grafana-langfuse-datasource
git push -u origin feature/flexible-query-builder
gh pr create \
  --title "feat: add flexible custom query builder" \
  --body "$(cat <<'EOF'
## Summary
- Adds a \`custom\` query mode alongside the existing 5 fixed metrics
- Users can pick resource (traces/observations/scores), any numeric field via dot-notation, and aggregation (sum/avg/count)
- Exposes the scores entity for the first time
- Existing fixed query types and all provisioned dashboards are unchanged

## Test Plan
- [ ] 39 tests pass: \`npm run test -- --watchAll=false --testPathPattern=.\`
- [ ] \`npm run build\` compiles with no TypeScript errors
- [ ] Grafana panel: Mode toggle switches between Fixed and Custom UI
- [ ] Custom query with scores/value/avg returns a time series
EOF
)"
```
