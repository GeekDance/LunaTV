import type { PlayRecord } from './db.client';

export interface PlaybackPosition {
  episodeIndex: number;
  time: number;
}

const titleKey = (title: string) => title.replace(/\s+/g, '').toLowerCase();
const knownYear = (year: string) => /^\d{4}$/.test(year);

/** The latest intent wins, including rewinding or returning to an earlier episode. */
export function resolveResumePosition(
  records: Record<string, PlayRecord>,
  work: { source: string; id: string; title: string; year: string }
): PlaybackPosition | null {
  const exactKey = `${work.source}+${work.id}`;
  const matches = Object.entries(records).filter(([key, record]) => {
    if (
      !Number.isInteger(record.index) ||
      record.index < 1 ||
      !Number.isFinite(record.play_time) ||
      record.play_time < 0
    )
      return false;
    if (record.title && titleKey(record.title) !== titleKey(work.title))
      return false;
    if (
      knownYear(record.year || '') &&
      knownYear(work.year) &&
      record.year !== work.year
    )
      return false;
    if (key === exactKey) return true;
    return (
      !!record.title &&
      !!work.title &&
      knownYear(work.year) &&
      record.year === work.year
    );
  });
  matches.sort(([aKey, a], [bKey, b]) => {
    const aTime = Number.isFinite(a.save_time) ? a.save_time : 0;
    const bTime = Number.isFinite(b.save_time) ? b.save_time : 0;
    return (
      bTime - aTime || Number(bKey === exactKey) - Number(aKey === exactKey)
    );
  });
  const record = matches[0]?.[1];
  return record
    ? { episodeIndex: record.index - 1, time: record.play_time }
    : null;
}

/** Pending seeks and captured positions survive a player's teardown/loading zeros. */
export function capturePosition(
  previous: PlaybackPosition,
  pendingTime: number | null,
  liveTime: number | undefined,
  episodeIndex: number
): PlaybackPosition {
  const savedTime = previous.episodeIndex === episodeIndex ? previous.time : 0;
  const time =
    pendingTime !== null && Number.isFinite(pendingTime) && pendingTime >= 0
      ? pendingTime
      : Number.isFinite(liveTime) && (liveTime as number) > 0
      ? (liveTime as number)
      : savedTime;
  return { episodeIndex, time };
}
