import { dateTime } from '@grafana/data';
import { LangfuseDatasource } from '../datasource';
import * as utils from '../utils';

// Only mock fetchAllPages — let bucketByTime run real so DataFrames are populated correctly.
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  fetchAllPages: jest.fn(),
}));

const mockFetchAllPages = utils.fetchAllPages as jest.MockedFunction<typeof utils.fetchAllPages>;

function makeInstanceSettings(overrides = {}) {
  return {
    id: 1,
    uid: 'test-uid',
    type: 'forge-langfuse-datasource',
    name: 'Langfuse Test',
    url: '/api/datasources/proxy/1',
    jsonData: {},
    ...overrides,
  } as any;
}

function makeQueryOptions(queryType: string, fromIso: string, toIso: string) {
  return {
    targets: [{ queryType, refId: 'A', hide: false }],
    range: {
      from: dateTime(fromIso),
      to: dateTime(toIso),
      raw: { from: fromIso, to: toIso },
    },
    requestId: 'test',
    timezone: 'UTC',
    scopedVars: {},
    startTime: 0,
  } as any;
}

describe('LangfuseDatasource.query', () => {
  let ds: LangfuseDatasource;

  beforeEach(() => {
    jest.clearAllMocks();
    ds = new LangfuseDatasource(makeInstanceSettings());
  });

  it('returns a DataFrame with time and value fields for trace_cost', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 't1', timestamp: '2024-01-01T01:00:00Z', totalCost: 0.05, latency: 1.5 },
      { id: 't2', timestamp: '2024-01-01T02:00:00Z', totalCost: 0.03, latency: 2.0 },
    ]);

    const result = await ds.query(
      makeQueryOptions('trace_cost', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')
    );

    expect(result.data).toHaveLength(1);
    const frame = result.data[0];
    expect(frame.fields[0].name).toBe('time');
    expect(frame.fields[1].name).toBe('Total Cost (USD)');
    expect(frame.fields[0].values.length).toBeGreaterThan(0);
  });

  it('returns latency values for trace_latency', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 't1', timestamp: '2024-01-01T01:00:00Z', totalCost: 0, latency: 2.5 },
    ]);

    const result = await ds.query(
      makeQueryOptions('trace_latency', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')
    );

    const frame = result.data[0];
    expect(frame.fields[1].name).toBe('Avg Latency (s)');
  });

  it('returns count values for trace_count', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 't1', timestamp: '2024-01-01T01:00:00Z' },
      { id: 't2', timestamp: '2024-01-01T01:05:00Z' },
    ]);

    const result = await ds.query(
      makeQueryOptions('trace_count', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')
    );

    const frame = result.data[0];
    expect(frame.fields[1].name).toBe('Trace Volume');
  });

  it('returns token totals for observation_tokens', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 'o1', startTime: '2024-01-01T01:00:00Z', totalCost: 0, usageDetails: { input: 100, output: 50, total: 150 } },
    ]);

    const result = await ds.query(
      makeQueryOptions('observation_tokens', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')
    );

    const frame = result.data[0];
    expect(frame.fields[1].name).toBe('Total Tokens');
  });

  it('returns cost for observation_cost', async () => {
    mockFetchAllPages.mockResolvedValue([
      { id: 'o1', startTime: '2024-01-01T01:00:00Z', totalCost: 0.02, usageDetails: null },
    ]);

    const result = await ds.query(
      makeQueryOptions('observation_cost', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')
    );

    const frame = result.data[0];
    expect(frame.fields[1].name).toBe('Observation Cost (USD)');
  });

  it('skips hidden targets', async () => {
    const options = makeQueryOptions('trace_cost', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
    options.targets[0].hide = true;

    const result = await ds.query(options);
    expect(result.data).toHaveLength(0);
    expect(mockFetchAllPages).not.toHaveBeenCalled();
  });

  it('uses the correct proxy URL prefix', async () => {
    mockFetchAllPages.mockResolvedValue([]);
    await ds.query(makeQueryOptions('trace_cost', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'));

    expect(mockFetchAllPages).toHaveBeenCalledWith(
      '/api/datasources/proxy/1/langfuse',
      '/api/public/traces',
      expect.any(Object)
    );
  });

  it('uses the correct proxy URL for observation queries', async () => {
    mockFetchAllPages.mockResolvedValue([]);
    await ds.query(makeQueryOptions('observation_tokens', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'));

    expect(mockFetchAllPages).toHaveBeenCalledWith(
      '/api/datasources/proxy/1/langfuse',
      '/api/public/observations',
      expect.any(Object)
    );
  });
});

describe('LangfuseDatasource.testDatasource', () => {
  it('returns success when Langfuse is reachable', async () => {
    mockFetchAllPages.mockResolvedValue([]);
    const ds = new LangfuseDatasource(makeInstanceSettings());
    const result = await ds.testDatasource();
    expect(result.status).toBe('success');
  });

  it('returns error when Langfuse is unreachable', async () => {
    mockFetchAllPages.mockRejectedValue(new Error('connection refused'));
    const ds = new LangfuseDatasource(makeInstanceSettings());
    const result = await ds.testDatasource();
    expect(result.status).toBe('error');
  });
});

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
    await ds.query(makeCustomOptions('observations'));
    expect(mockFetchAllPages).toHaveBeenCalledWith(
      expect.any(String),
      '/api/public/observations',
      expect.objectContaining({ fromStartTime: expect.any(String), toStartTime: expect.any(String) })
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
