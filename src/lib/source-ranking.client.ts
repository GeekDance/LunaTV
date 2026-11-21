import type { PlaybackProbe } from './playback-startup.client';
import type { SearchResult } from './types';

export interface SourceVideoInfo extends PlaybackProbe {
  hasError?: boolean;
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
    const time = info?.startupTimeMs;
    const timed = typeof time === 'number' && Number.isFinite(time) && time > 0;
    return {
      group: current ? 0 : info?.hasError ? 3 : timed ? 1 : 2,
      time: timed ? time : Infinity,
    };
  };
  return sources
    .map((source, index) => ({ source, index, ...rank(source) }))
    .sort(
      (a, b) =>
        a.group - b.group ||
        (a.group === 1 && b.group === 1 ? a.time - b.time : 0) ||
        a.index - b.index
    )
    .map((entry) => entry.source);
}
