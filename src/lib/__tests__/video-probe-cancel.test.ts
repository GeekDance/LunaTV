import Hls from 'hls.js';

import { getVideoResolutionFromM3u8 } from '../utils';

jest.mock('hls.js', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    Events: { FRAG_LOADING: 'loading', FRAG_LOADED: 'loaded', ERROR: 'error' },
  }),
}));
const mockDestroy = jest.fn();
const originalFetch = global.fetch;
const originalTiming = Object.getOwnPropertyDescriptor(
  performance,
  'getEntriesByName'
);
beforeEach(() => {
  jest.useFakeTimers();
  mockDestroy.mockClear();
  (Hls as unknown as jest.Mock).mockClear().mockImplementation(() => ({
    destroy: mockDestroy,
    on: jest.fn(),
    loadSource: jest.fn(),
    attachMedia: jest.fn(),
  }));
  global.fetch = jest.fn(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('canceled'), { name: 'AbortError' }))
        );
      })
  );
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (originalTiming)
    Object.defineProperty(performance, 'getEntriesByName', originalTiming);
  else
    delete (performance as unknown as { getEntriesByName?: unknown })
      .getEntriesByName;
});

test('aborting a probe destroys HLS and clears the timeout without an extra HEAD request', async () => {
  const controller = new AbortController();
  const result = getVideoResolutionFromM3u8(
    'https://example.test/media.m3u8',
    controller.signal
  );
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('the existing four-second probe timeout releases the media probe', async () => {
  const result = getVideoResolutionFromM3u8('https://example.test/media.m3u8');
  jest.advanceTimersByTime(4000);
  await expect(result).rejects.toThrow('Timeout waiting for first video frame');
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

test('a cached fragment is labelled as cached instead of reporting gigabytes per second', async () => {
  jest.spyOn(performance, 'now').mockReturnValue(1000);
  Object.defineProperty(performance, 'getEntriesByName', {
    configurable: true,
    value: jest.fn(() => [
      {
        name: 'https://example.test/first.ts',
        startTime: 1000,
        requestStart: 1000,
        responseStart: 1000.1,
        responseEnd: 1001,
        transferSize: 0,
        encodedBodySize: 1000000,
        decodedBodySize: 1000000,
        workerStart: 0,
      },
    ]),
  });
  const result = getVideoResolutionFromM3u8('https://example.test/media.m3u8');
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  const video = hls.attachMedia.mock.calls[0][0];
  Object.defineProperty(video, 'videoWidth', { value: 1920 });
  const handler = (event: string) =>
    hls.on.mock.calls.find(([name]: [string]) => name === event)?.[1];
  handler('loading')?.();
  (performance.now as jest.Mock).mockReturnValue(1001);
  Object.defineProperty(video, 'readyState', { value: 2 });
  video.onloadeddata?.(new Event('loadeddata'));
  handler('loaded')('loaded', {
    frag: {
      type: 'main',
      sn: 1,
      url: 'https://example.test/first.ts',
      stats: { loading: { start: 1000, first: 1000.1, end: 1001 } },
    },
    payload: new ArrayBuffer(1000000),
  });
  jest.advanceTimersByTime(0);
  expect(await result).toMatchObject({
    loadSpeed: '缓存命中',
    speedStatus: 'cached',
  });
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});

test('overlapping fragment starts cannot replace the completed fragments own timing', async () => {
  jest.spyOn(performance, 'now').mockReturnValue(1000);
  Object.defineProperty(performance, 'getEntriesByName', {
    configurable: true,
    value: jest.fn(() => [
      {
        name: 'https://example.test/first.ts',
        startTime: 1000,
        requestStart: 1001,
        responseStart: 1100,
        responseEnd: 1400,
        transferSize: 1000300,
        encodedBodySize: 1000000,
        decodedBodySize: 1000000,
        workerStart: 0,
      },
    ]),
  });
  const result = getVideoResolutionFromM3u8('https://example.test/media.m3u8');
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  const video = hls.attachMedia.mock.calls[0][0];
  Object.defineProperty(video, 'videoWidth', { value: 1920 });
  const handler = (event: string) =>
    hls.on.mock.calls.find(([name]: [string]) => name === event)?.[1];
  handler('loading')?.();
  (performance.now as jest.Mock).mockReturnValue(1399);
  handler('loading')?.();
  (performance.now as jest.Mock).mockReturnValue(1400);
  Object.defineProperty(video, 'readyState', { value: 2 });
  video.onloadeddata?.(new Event('loadeddata'));
  handler('loaded')('loaded', {
    frag: {
      type: 'main',
      sn: 1,
      url: 'https://example.test/first.ts',
      stats: { loading: { start: 1000, first: 1100, end: 1400 } },
    },
    payload: new ArrayBuffer(1000000),
  });
  jest.advanceTimersByTime(0);
  expect(await result).toMatchObject({
    loadSpeed: '2.5 MB/s',
    speedStatus: 'measured',
    loadTimeMs: 400,
    pingTime: 100,
  });
  expect(fetch).not.toHaveBeenCalled();
});

test('canceling between fragment completion and measurement clears every timer', async () => {
  const controller = new AbortController();
  const result = getVideoResolutionFromM3u8(
    'https://example.test/media.m3u8',
    controller.signal
  );
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  hls.on.mock.calls.find(([name]: [string]) => name === 'loaded')[1]('loaded', {
    frag: { sn: 1, type: 'main' },
    payload: new ArrayBuffer(100),
  });
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(jest.getTimerCount()).toBe(0);
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});

test('startup timing includes playlist and decoding waits and cannot finish on metadata or a cached fragment alone', async () => {
  jest.spyOn(performance, 'now').mockReturnValue(1000);
  const result = getVideoResolutionFromM3u8('https://example.test/media.m3u8');
  let done = false;
  void result.then(() => {
    done = true;
  });
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  const video = hls.attachMedia.mock.calls[0][0];
  Object.defineProperty(video, 'videoWidth', { value: 1920 });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
  (performance.now as jest.Mock).mockReturnValue(1300);
  video.onloadedmetadata?.(new Event('loadedmetadata'));
  hls.on.mock.calls.find(([name]: [string]) => name === 'loaded')[1]('loaded', {
    frag: {
      type: 'main',
      sn: 1,
      url: 'https://example.test/first.ts',
      stats: { loading: { start: 1200, first: 1201, end: 1202 } },
    },
    payload: new ArrayBuffer(1000000),
  });
  jest.advanceTimersByTime(0);
  await Promise.resolve();
  await Promise.resolve();
  expect(done).toBe(false);
  (performance.now as jest.Mock).mockReturnValue(1750);
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  video.onloadeddata?.(new Event('loadeddata'));
  expect(await result).toMatchObject({ startupTimeMs: 750, loadTimeMs: 2 });
});

test('metadata-only sources time out instead of being ranked as playable', async () => {
  const result = getVideoResolutionFromM3u8('https://example.test/media.m3u8');
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  const video = hls.attachMedia.mock.calls[0][0];
  Object.defineProperty(video, 'readyState', { value: 1 });
  video.onloadedmetadata?.(new Event('loadedmetadata'));
  hls.on.mock.calls.find(([name]: [string]) => name === 'loaded')[1]('loaded', {
    frag: { sn: 1, type: 'main' },
    payload: new ArrayBuffer(100),
  });
  jest.advanceTimersByTime(4000);
  await expect(result).rejects.toThrow('Timeout waiting for first video frame');
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  expect(video.onloadeddata).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});
