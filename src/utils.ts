import { getBackendSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import { LangfusePage } from './types';

export async function fetchAllPages<T>(
  proxyUrl: string,
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const response = await lastValueFrom(
      getBackendSrv().fetch<LangfusePage<T>>({
        url: `${proxyUrl}${path}`,
        params: { ...params, page, limit: 50 },
      })
    );

    results.push(...response.data.data);

    if (page >= (response.data.meta?.totalPages ?? 1)) {
      break;
    }
    page++;
  }

  return results;
}

export function bucketByTime(
  timestamps: string[],
  values: Array<number | null>,
  from: number,
  to: number,
  aggregation: 'sum' | 'avg' | 'count',
): { times: number[]; values: number[] } {
  const bucketMs = getBucketSize(to - from);
  const bucketCount = Math.ceil((to - from) / bucketMs);
  const buckets: Array<number[]> = Array.from({ length: bucketCount }, () => []);

  for (let i = 0; i < timestamps.length; i++) {
    const ts = new Date(timestamps[i]).getTime();
    if (ts < from || ts > to) {
      continue;
    }
    const idx = Math.floor((ts - from) / bucketMs);
    if (idx >= 0 && idx < bucketCount) {
      if (aggregation === 'count') {
        buckets[idx].push(0); // value doesn't matter for count
      } else if (values[i] !== null && values[i] !== undefined) {
        buckets[idx].push(values[i] as number);
      }
    }
  }

  const times = Array.from({ length: bucketCount }, (_, i) => from + i * bucketMs);
  const resultValues = buckets.map((bucket) => {
    if (aggregation === 'count') {
      return bucket.length;
    }
    if (bucket.length === 0) {
      return 0;
    }
    const sum = bucket.reduce((a, b) => a + b, 0);
    return aggregation === 'sum' ? sum : sum / bucket.length;
  });

  return { times, values: resultValues };
}

export function getBucketSize(rangeMs: number): number {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  if (rangeMs <= 6 * HOUR) {
    return 10 * 60_000; // 10 minutes
  }
  if (rangeMs <= 7 * DAY) {
    return HOUR; // 1 hour
  }
  return DAY; // 1 day
}
