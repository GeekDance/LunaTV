export type ProbeSpeedStatus =
  | 'measured'
  | 'cached'
  | 'insufficient'
  | 'unavailable';
export interface ProbeNetworkInfo {
  loadSpeed: string;
  pingTime: number;
  speedStatus?: ProbeSpeedStatus;
  loadTimeMs?: number;
}
export interface ProbeRequestStats {
  loading: { start: number; first?: number; end: number };
  retry?: number;
  aborted?: boolean;
}
export interface ProbeResourceTiming {
  startTime: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  workerStart?: number;
  deliveryType?: string;
  responseStatus?: number;
}

/** A fragment's own request must match this entry; an older cached entry is not evidence. */
export function matchesProbeResource(
  stats: ProbeRequestStats,
  entry: ProbeResourceTiming
): boolean {
  const { start, end } = stats.loading;
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end >= start &&
    entry.startTime >= start - 1 &&
    entry.startTime <= start + 10 &&
    entry.responseEnd >= start &&
    entry.responseEnd <= end + 5
  );
}

/** Effective body download rate for one sufficiently large, nonlocal-cache sample. */
export function measureProbeNetwork(
  stats?: ProbeRequestStats,
  resource?: ProbeResourceTiming
): ProbeNetworkInfo {
  const start = stats?.loading.start;
  const end = stats?.loading.end;
  const elapsed =
    typeof start === 'number' && typeof end === 'number' ? end - start : NaN;
  const first = stats?.loading.first;
  const responseMs =
    typeof first === 'number' &&
    typeof start === 'number' &&
    first > start &&
    first <= (end as number)
      ? first - start
      : 0;
  const base = {
    pingTime: Math.round(responseMs),
    loadTimeMs:
      Number.isFinite(elapsed) && elapsed > 0
        ? Math.max(1, Math.round(elapsed))
        : undefined,
  };
  const unavailable: ProbeNetworkInfo = {
    ...base,
    loadSpeed: '速度不可测',
    speedStatus: 'unavailable',
  };
  if (
    !stats ||
    !resource ||
    stats.aborted ||
    stats.retry ||
    !matchesProbeResource(stats, resource)
  )
    return unavailable;

  if (
    (resource.workerStart || 0) > 0 &&
    resource.deliveryType !== 'cache' &&
    resource.responseStatus !== 304
  )
    return unavailable;
  const exposedTiming =
    resource.requestStart > 0 &&
    resource.requestStart >= resource.startTime &&
    resource.responseStart >= resource.requestStart &&
    resource.responseEnd >= resource.responseStart;
  const localCache =
    resource.deliveryType === 'cache' ||
    resource.responseStatus === 304 ||
    (exposedTiming &&
      resource.decodedBodySize > 0 &&
      resource.transferSize === 0) ||
    (resource.transferSize > 0 &&
      resource.encodedBodySize > resource.transferSize);
  if (localCache)
    return { ...base, loadSpeed: '缓存命中', speedStatus: 'cached' };
  // transferSize=0 alone also occurs under cross-origin timing restrictions.
  if (
    !exposedTiming ||
    !Number.isFinite(resource.transferSize) ||
    resource.transferSize <= 0 ||
    !Number.isFinite(resource.encodedBodySize) ||
    resource.encodedBodySize <= 0 ||
    (resource.workerStart || 0) > 0
  )
    return unavailable;
  const duration = Math.max(elapsed, resource.responseEnd - resource.startTime);
  if (
    !Number.isFinite(duration) ||
    duration < 200 ||
    resource.encodedBodySize < 128 * 1024
  ) {
    return { ...base, loadSpeed: '样本不足', speedStatus: 'insufficient' };
  }
  const bytesPerSecond = resource.encodedBodySize / (duration / 1000);
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0)
    return unavailable;
  // SI labels: 1 MB/s = 1,000,000 bytes/s, unlike MiB/s.
  return {
    ...base,
    speedStatus: 'measured',
    loadSpeed:
      bytesPerSecond >= 1000000
        ? `${(bytesPerSecond / 1000000).toFixed(1)} MB/s`
        : `${(bytesPerSecond / 1000).toFixed(1)} KB/s`,
  };
}
