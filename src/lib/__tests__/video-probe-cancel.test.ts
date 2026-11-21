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
beforeEach(() => {
  jest.useFakeTimers();
  mockDestroy.mockClear();
  (Hls as unknown as jest.Mock)
    .mockClear()
    .mockImplementation(() => ({
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
});

test('aborting a probe destroys HLS, cancels HEAD and clears the timeout', async () => {
  const controller = new AbortController();
  const result = getVideoResolutionFromM3u8(
    'https://example.test/media.m3u8',
    controller.signal
  );
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  expect((fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('the existing four-second probe timeout also releases the HEAD request', async () => {
  const result = getVideoResolutionFromM3u8('https://example.test/media.m3u8');
  jest.advanceTimersByTime(4000);
  await expect(result).rejects.toThrow('Timeout loading video metadata');
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  expect((fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
});
