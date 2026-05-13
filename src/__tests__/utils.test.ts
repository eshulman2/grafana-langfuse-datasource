import { getBucketSize, bucketByTime } from '../utils';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('getBucketSize', () => {
  it('returns 10-minute buckets for ranges up to 6 hours', () => {
    expect(getBucketSize(6 * HOUR)).toBe(10 * MIN);
    expect(getBucketSize(1 * HOUR)).toBe(10 * MIN);
  });

  it('returns 1-hour buckets for ranges between 6 hours and 7 days', () => {
    expect(getBucketSize(7 * HOUR)).toBe(HOUR);
    expect(getBucketSize(24 * HOUR)).toBe(HOUR);
    expect(getBucketSize(7 * DAY)).toBe(HOUR);
  });

  it('returns 1-day buckets for ranges over 7 days', () => {
    expect(getBucketSize(8 * DAY)).toBe(DAY);
    expect(getBucketSize(30 * DAY)).toBe(DAY);
  });
});

describe('bucketByTime', () => {
  const from = new Date('2024-01-01T00:00:00Z').getTime();
  const to = new Date('2024-01-01T06:00:00Z').getTime(); // 6h range → 10min buckets

  it('sums values within the same bucket', () => {
    const timestamps = [
      '2024-01-01T00:05:00Z', // bucket 0
      '2024-01-01T00:08:00Z', // bucket 0 (same 10min window)
    ];
    const values = [1.0, 2.0];
    const result = bucketByTime(timestamps, values, from, to, 'sum');
    expect(result.values[0]).toBeCloseTo(3.0);
  });

  it('averages values within the same bucket', () => {
    const timestamps = [
      '2024-01-01T00:05:00Z',
      '2024-01-01T00:08:00Z',
    ];
    const values = [1.0, 3.0];
    const result = bucketByTime(timestamps, values, from, to, 'avg');
    expect(result.values[0]).toBeCloseTo(2.0);
  });

  it('counts records per bucket regardless of value', () => {
    const timestamps = [
      '2024-01-01T00:05:00Z',
      '2024-01-01T00:06:00Z',
      '2024-01-01T01:05:00Z', // different bucket
    ];
    const values = [null, null, null];
    const result = bucketByTime(timestamps, values, from, to, 'count');
    expect(result.values[0]).toBe(2);
    expect(result.values[6]).toBe(1); // 60min / 10min = bucket 6
  });

  it('returns zero for empty buckets', () => {
    const result = bucketByTime([], [], from, to, 'sum');
    expect(result.values.every((v) => v === 0)).toBe(true);
  });

  it('drops records outside the time range', () => {
    const timestamps = ['2023-12-31T23:59:00Z']; // before from
    const values = [999];
    const result = bucketByTime(timestamps, values, from, to, 'sum');
    expect(result.values.every((v) => v === 0)).toBe(true);
  });

  it('returns one time value per bucket', () => {
    const result = bucketByTime([], [], from, to, 'sum');
    const expectedBuckets = Math.ceil((to - from) / (10 * MIN));
    expect(result.times).toHaveLength(expectedBuckets);
  });

  it('treats null values as zero for sum and avg', () => {
    const timestamps = ['2024-01-01T00:05:00Z'];
    const values: Array<number | null> = [null];
    const result = bucketByTime(timestamps, values, from, to, 'sum');
    expect(result.values[0]).toBe(0);
  });
});

import { fetchAllPages } from '../utils';
import { getBackendSrv } from '@grafana/runtime';
import { of } from 'rxjs';

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: jest.fn(),
}));

const mockGetBackendSrv = getBackendSrv as jest.MockedFunction<typeof getBackendSrv>;

function mockFetch(pages: Array<{ data: unknown[]; totalPages: number }>) {
  let call = 0;
  mockGetBackendSrv.mockReturnValue({
    fetch: jest.fn().mockImplementation(() => {
      const page = pages[call++];
      return of({
        data: {
          data: page.data,
          meta: { page: call, limit: 50, totalItems: page.data.length, totalPages: page.totalPages },
        },
      });
    }),
  } as any);
}

describe('fetchAllPages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all items from a single-page response', async () => {
    mockFetch([{ data: [{ id: '1' }, { id: '2' }], totalPages: 1 }]);
    const result = await fetchAllPages('/proxy/langfuse', '/api/public/traces', {});
    expect(result).toHaveLength(2);
  });

  it('fetches all pages when totalPages > 1', async () => {
    mockFetch([
      { data: [{ id: '1' }], totalPages: 2 },
      { data: [{ id: '2' }], totalPages: 2 },
    ]);
    const result = await fetchAllPages('/proxy/langfuse', '/api/public/traces', {});
    expect(result).toHaveLength(2);
    expect((result[0] as any).id).toBe('1');
    expect((result[1] as any).id).toBe('2');
  });

  it('passes params and injects page number on each request', async () => {
    const fetchMock = jest.fn().mockReturnValue(
      of({ data: { data: [], meta: { totalPages: 1 } } })
    );
    mockGetBackendSrv.mockReturnValue({ fetch: fetchMock } as any);

    await fetchAllPages('/proxy/langfuse', '/api/public/traces', { fromUpdatedAt: '2024-01-01T00:00:00Z' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/proxy/langfuse/api/public/traces',
        params: expect.objectContaining({ fromUpdatedAt: '2024-01-01T00:00:00Z', page: 1, limit: 50 }),
      })
    );
  });

  it('returns empty array when response data is empty', async () => {
    mockFetch([{ data: [], totalPages: 1 }]);
    const result = await fetchAllPages('/proxy/langfuse', '/api/public/traces', {});
    expect(result).toHaveLength(0);
  });
});
