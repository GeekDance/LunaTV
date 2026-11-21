import { sortPlaybackSources } from '../source-ranking.client';
import type { SearchResult } from '../types';

const source = (id: string) => ({ source: id, id, title: id } as SearchResult);
const info = (loadSpeed: string, pingTime = 20, hasError = false) => ({
  quality: '1080p',
  loadSpeed,
  pingTime,
  hasError,
});

test('pins current source, ranks verified speeds, then pending and failed sources', () => {
  const sources = ['pending', 'bad', 'slow', 'fast', 'current', 'tied'].map(
    source
  );
  Object.freeze(sources);
  const results = new Map([
    ['bad-bad', info('999 MB/s', 1, true)],
    ['slow-slow', info('900 KB/s')],
    ['fast-fast', info('2 MB/s', 15)],
    ['current-current', info('未知', 0, true)],
    ['tied-tied', info('2 MB/s', 5)],
  ]);
  expect(
    sortPlaybackSources(sources, results, 'current', 'current').map((s) => s.id)
  ).toEqual(['current', 'tied', 'fast', 'slow', 'pending', 'bad']);
  expect(sources[0].id).toBe('pending');
});

test('compares units numerically, handles missing metrics, and keeps equal results stable', () => {
  const sources = ['kb', 'mb', 'gb', 'unknown', 'missing', 'tie1', 'tie2'].map(
    source
  );
  const results = new Map([
    ['kb-kb', info('900 KB/s')],
    ['mb-mb', info('1 MB/s')],
    ['gb-gb', info('0.01 GB/s')],
    ['unknown-unknown', info('未知', -1)],
    ['missing-missing', info('NaN MB/s', NaN)],
    ['tie1-tie1', info('1024 KB/s', 20)],
    ['tie2-tie2', info('1 MB/s', 20)],
  ]);
  expect(sortPlaybackSources(sources, results).map((s) => s.id)).toEqual([
    'gb',
    'mb',
    'tie1',
    'tie2',
    'kb',
    'unknown',
    'missing',
  ]);
});

test('unknown zero latency cannot outrank a measured latency at the same speed', () => {
  const sources = ['unknown', 'measured'].map(source);
  const results = new Map([
    ['unknown-unknown', info('2 MB/s', 0)],
    ['measured-measured', info('2 MB/s', 30)],
  ]);
  expect(sortPlaybackSources(sources, results).map((s) => s.id)).toEqual([
    'measured',
    'unknown',
  ]);
});
