import { sortPlaybackSources, SourceVideoInfo } from '../source-ranking.client';
import type { SearchResult } from '../types';

const source = (id: string) => ({ source: id, id, title: id } as SearchResult);
const info = (startupTimeMs?: number, hasError = false) => ({
  quality: '1080p',
  loadSpeed: '速度不可测',
  pingTime: 20,
  startupTimeMs,
  hasError,
});

test('pins current source, ranks actual startup times, then pending and failed sources', () => {
  const sources = ['pending', 'bad', 'slow', 'fast', 'current', 'tied'].map(
    source
  );
  Object.freeze(sources);
  const results = new Map<string, SourceVideoInfo>([
    ['bad-bad', info(1, true)],
    ['slow-slow', info(900)],
    ['fast-fast', info(200)],
    ['current-current', info(undefined, true)],
    ['tied-tied', info(200)],
  ]);
  expect(
    sortPlaybackSources(sources, results, 'current', 'current').map((s) => s.id)
  ).toEqual(['current', 'fast', 'tied', 'slow', 'pending', 'bad']);
  expect(sources[0].id).toBe('pending');
});
test('download speed, fragment time and ping never override startup time', () => {
  const sources = ['bandwidth', 'instantFragment', 'fastFrame'].map(source);
  const results = new Map<string, SourceVideoInfo>([
    [
      'bandwidth-bandwidth',
      { ...info(1500), loadSpeed: '999 MB/s', pingTime: 1 },
    ],
    ['instantFragment-instantFragment', { ...info(800), loadTimeMs: 1 }],
    [
      'fastFrame-fastFrame',
      { ...info(100), loadSpeed: '速度不可测', pingTime: 100 },
    ],
  ]);
  expect(sortPlaybackSources(sources, results).map((s) => s.id)).toEqual([
    'fastFrame',
    'instantFragment',
    'bandwidth',
  ]);
});
test('invalid or legacy timings stay pending and equal startup times preserve discovery order', () => {
  const sources = [
    'zero',
    'negative',
    'nan',
    'infinity',
    'legacy',
    'a',
    'b',
    'failed',
  ].map(source);
  const results = new Map<string, SourceVideoInfo>([
    ['zero-zero', info(0)],
    ['negative-negative', info(-1)],
    ['nan-nan', info(NaN)],
    ['infinity-infinity', info(Infinity)],
    ['legacy-legacy', { ...info(), loadTimeMs: 1 }],
    ['a-a', info(300)],
    ['b-b', info(300)],
    ['failed-failed', info(1, true)],
  ]);
  expect(sortPlaybackSources(sources, results).map((s) => s.id)).toEqual([
    'a',
    'b',
    'zero',
    'negative',
    'nan',
    'infinity',
    'legacy',
    'failed',
  ]);
});
