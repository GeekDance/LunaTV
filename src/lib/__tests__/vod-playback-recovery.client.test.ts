import type { SearchResult } from '../types';
import {
  createVodFallback,
  watchVodPlayback,
} from '../vod-playback-recovery.client';
const entry = (id: string) =>
  ({
    source: id,
    id,
    episodes: [`https://example.test/${id}.m3u8`],
  } as SearchResult);
const info = { quality: '1080p', loadSpeed: '2 MB/s', pingTime: 20 };
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a stalled first frame has a finite failure path and cannot fail repeatedly', () => {
  const video = document.createElement('video');
  const failed = jest.fn();
  const guard = watchVodPlayback(video, {
    onReady: jest.fn(),
    onFailure: failed,
  });
  jest.advanceTimersByTime(12000);
  guard.fail();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledWith('timeout');
  guard.cancel();
});

test('a ready but autoplay-paused video reveals controls and does not time out', () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 4 });
  const ready = jest.fn(),
    failed = jest.fn();
  const guard = watchVodPlayback(video, { onReady: ready, onFailure: failed });
  video.dispatchEvent(new Event('canplay'));
  jest.advanceTimersByTime(12000);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
  guard.cancel();
});

test('canceling an attempt ignores late events and timeout callbacks', () => {
  const video = document.createElement('video');
  const failed = jest.fn();
  const guard = watchVodPlayback(video, {
    onReady: jest.fn(),
    onFailure: failed,
  });
  guard.cancel();
  video.dispatchEvent(new Event('error'));
  jest.advanceTimersByTime(20000);
  expect(failed).not.toHaveBeenCalled();
});

test('a later verified source wins and cancels other probes without exceeding four workers', async () => {
  const found = jest.fn(),
    exhausted = jest.fn();
  const signals: AbortSignal[] = [];
  const pool = createVodFallback({
    urlFor: (s) => s.episodes[0],
    allowed: () => true,
    probe: async (url, signal) => {
      signals.push(signal);
      if (url.includes('good')) return info;
      return new Promise(() => undefined);
    },
    onFound: found,
    onExhausted: exhausted,
  });
  pool.offer([entry('bad1'), entry('bad2')]);
  await flush();
  pool.offer([entry('bad1'), entry('good')]);
  await flush();
  expect(signals).toHaveLength(3);
  expect(found).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'good' }),
    info
  );
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  jest.advanceTimersByTime(8000);
  expect(exhausted).not.toHaveBeenCalled();
});

test('a canceled fallback cannot override a later manual selection', async () => {
  let finish: (value: typeof info) => void = () => undefined;
  const found = jest.fn();
  const pool = createVodFallback({
    urlFor: (s) => s.episodes[0],
    allowed: () => true,
    probe: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    onFound: found,
    onExhausted: jest.fn(),
  });
  pool.offer([entry('late')]);
  await flush();
  pool.cancel();
  finish(info);
  await flush();
  expect(found).not.toHaveBeenCalled();
});

test('recovery expires with no source and does not relaunch after the deadline', async () => {
  const exhausted = jest.fn(),
    probe = jest.fn();
  const pool = createVodFallback({
    urlFor: (s) => s.episodes[0],
    allowed: () => true,
    probe,
    onFound: jest.fn(),
    onExhausted: exhausted,
  });
  jest.advanceTimersByTime(8000);
  pool.offer([entry('late')]);
  await flush();
  expect(exhausted).toHaveBeenCalledTimes(1);
  expect(probe).not.toHaveBeenCalled();
});

test('never starts more than four fallback probes concurrently', async () => {
  const probe = jest.fn(() => new Promise<typeof info>(() => undefined));
  const pool = createVodFallback({
    urlFor: (s) => s.episodes[0],
    allowed: () => true,
    probe,
    onFound: jest.fn(),
    onExhausted: jest.fn(),
  });
  pool.offer(Array.from({ length: 12 }, (_, id) => entry(String(id))));
  await flush();
  expect(probe).toHaveBeenCalledTimes(4);
  pool.cancel();
});

test('a later discovery gets a fresh bounded probe round without reviving the expired round', async () => {
  const found = jest.fn(),
    exhausted = jest.fn(),
    searching = jest.fn();
  let oldFinish: (value: typeof info) => void = () => undefined;
  const pool = createVodFallback({
    allowLateSources: true,
    urlFor: (s) => s.episodes[0],
    allowed: () => true,
    probe: (url) =>
      url.includes('late')
        ? Promise.resolve(info)
        : new Promise((resolve) => {
            oldFinish = resolve;
          }),
    onFound: found,
    onExhausted: exhausted,
    onSearching: searching,
  });
  pool.offer([entry('old')]);
  await flush();
  jest.advanceTimersByTime(8000);
  expect(exhausted).toHaveBeenCalledTimes(1);
  oldFinish(info);
  await flush();
  expect(found).not.toHaveBeenCalled();
  pool.offer([entry('old'), entry('late')]);
  await flush();
  expect(searching).toHaveBeenCalledTimes(1);
  expect(found).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'late' }),
    info
  );
  pool.cancel();
  pool.offer([entry('newer')]);
  await flush();
  expect(found).toHaveBeenCalledTimes(1);
});
