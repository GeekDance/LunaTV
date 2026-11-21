import type { SearchResult } from './types';

export interface SourceVideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
}

function bytesPerSecond(value: string): number {
  const match = value
    .trim()
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*([KMGT]?)i?B\s*\/\s*s$/i);
  if (!match) return 0;
  const magnitude = ['', 'K', 'M', 'G', 'T'].indexOf(match[2].toUpperCase());
  const speed = Number(match[1]) * 1024 ** magnitude;
  return Number.isFinite(speed) && speed > 0 ? speed : 0;
}

/** Rank the displayed alternatives only; changing rank must never select playback. */
export function sortPlaybackSources(
  sources: readonly SearchResult[],
  measurements: ReadonlyMap<string, SourceVideoInfo>,
  currentSource?: string,
  currentId?: string
): SearchResult[] {
  const rank = (source: SearchResult) => {
    const info = measurements.get(`${source.source}-${source.id}`);
    const current =
      currentSource !== undefined &&
      currentId !== undefined &&
      String(source.source) === String(currentSource) &&
      String(source.id) === String(currentId);
    const group = current ? 0 : info?.hasError ? 3 : info ? 1 : 2;
    return {
      group,
      speed: info && !info.hasError ? bytesPerSecond(info.loadSpeed) : 0,
      ping:
        info && Number.isFinite(info.pingTime) && info.pingTime > 0
          ? info.pingTime
          : Infinity,
    };
  };
  return sources
    .map((source, index) => ({ source, index, ...rank(source) }))
    .sort(
      (a, b) =>
        a.group - b.group ||
        b.speed - a.speed ||
        // Latency breaks ties only between successfully checked streams.
        (a.group === 1 && b.group === 1 ? a.ping - b.ping : 0) ||
        a.index - b.index
    )
    .map((entry) => entry.source);
}
