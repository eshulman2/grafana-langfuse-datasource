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
      case 'traces_view':
        return this.queryTracesView(target.refId, fromIso, toIso);
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
    if (!config) {
      return new MutableDataFrame({ refId: target.refId, fields: [] });
    }

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

  private async queryTracesView(refId: string, fromIso: string, toIso: string): Promise<MutableDataFrame> {
    const traces = await fetchAllPages<LangfuseTrace>(this.proxyUrl, '/api/public/traces', {
      fromUpdatedAt: fromIso,
      toUpdatedAt: toIso,
    });

    const frame = new MutableDataFrame({
      refId,
      meta: { preferredVisualisationType: 'trace' as any },
      fields: [
        { name: 'traceID', type: FieldType.string, values: [] },
        { name: 'spanID', type: FieldType.string, values: [] },
        { name: 'parentSpanID', type: FieldType.string, values: [] },
        { name: 'operationName', type: FieldType.string, values: [] },
        { name: 'serviceName', type: FieldType.string, values: [] },
        { name: 'startTime', type: FieldType.number, values: [] },
        { name: 'duration', type: FieldType.number, values: [] },
        { name: 'tags', type: FieldType.other, values: [] },
        { name: 'logs', type: FieldType.other, values: [] },
        { name: 'warnings', type: FieldType.other, values: [] },
      ],
    });

    for (const trace of traces) {
      const tags: Array<{ key: string; value: string }> = [];
      if (trace.totalCost != null) {
        tags.push({ key: 'cost', value: String(trace.totalCost) });
      }
      if (trace.environment) {
        tags.push({ key: 'environment', value: trace.environment });
      }
      if (trace.userId) {
        tags.push({ key: 'userId', value: trace.userId });
      }

      frame.add({
        traceID: trace.id,
        spanID: trace.id,
        parentSpanID: '',
        operationName: trace.name || trace.id,
        serviceName: 'langfuse',
        startTime: new Date(trace.timestamp).getTime(),
        duration: (trace.latency ?? 0) * 1000,
        tags,
        logs: [],
        warnings: [],
      });
    }

    return frame;
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
