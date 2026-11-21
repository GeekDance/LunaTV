import {
  capturePosition,
  resolveResumePosition,
} from '../playback-position.client';
import type { PlayRecord } from '../types';

const record = (overrides: Partial<PlayRecord> = {}): PlayRecord => ({
  title: 'Demo',
  year: '2026',
  source_name: 'A',
  cover: '',
  index: 2,
  total_episodes: 10,
  play_time: 120,
  total_time: 1000,
  save_time: 1,
  search_title: '',
  ...overrides,
});
const work = { source: 'a', id: '1', title: 'Demo', year: '2026' };

test('uses the newest matching record across sources, including a rewind or earlier episode', () => {
  expect(
    resolveResumePosition(
      {
        'a+1': record(),
        'b+2': record({ index: 1, play_time: 0, save_time: 2 }),
      },
      work
    )
  ).toEqual({ episodeIndex: 0, time: 0 });
});
test('does not reuse another title, remake year, or unknown-year cross-source record', () => {
  expect(
    resolveResumePosition(
      {
        'b+2': record({ title: 'Other' }),
        'c+3': record({ year: '1999' }),
        'd+4': record({ year: 'unknown' }),
      },
      work
    )
  ).toBeNull();
});
test('keeps exact-source legacy records without title/year, but ignores corrupt positions', () => {
  expect(
    resolveResumePosition(
      { 'a+1': record({ title: '', year: '', play_time: 75 }) },
      work
    )?.time
  ).toBe(75);
  expect(
    resolveResumePosition(
      { 'a+1': record({ index: -1 }), 'b+2': record({ play_time: NaN }) },
      work
    )
  ).toBeNull();
});
test('pending resume outranks a transient player zero and survives repeated handoffs', () => {
  expect(capturePosition({ episodeIndex: 1, time: 120 }, 120, 0, 1)).toEqual({
    episodeIndex: 1,
    time: 120,
  });
  expect(capturePosition({ episodeIndex: 1, time: 135 }, null, 0, 1)).toEqual({
    episodeIndex: 1,
    time: 135,
  });
});
test('a live position supersedes the saved snapshot while changing episodes resets it', () => {
  expect(
    capturePosition({ episodeIndex: 1, time: 120 }, null, 150, 1).time
  ).toBe(150);
  expect(capturePosition({ episodeIndex: 1, time: 150 }, 0, 150, 2)).toEqual({
    episodeIndex: 2,
    time: 0,
  });
  expect(capturePosition({ episodeIndex: 1, time: 0 }, null, 0, 1).time).toBe(
    0
  );
});
