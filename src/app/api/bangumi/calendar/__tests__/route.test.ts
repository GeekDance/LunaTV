/** @jest-environment ./test/node-web-environment.cjs */
import { GET } from '../route';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

test('returns the upstream calendar with cache headers', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify([{ weekday: { en: 'Mon' }, items: [] }]))
    );
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    { weekday: { en: 'Mon' }, items: [] },
  ]);
  expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=[1-9]\d*/);
});

test('returns an uncached gateway error when the calendar service fails', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue(new Response('unavailable', { status: 503 }));
  const response = await GET();
  expect(response.status).toBe(502);
  expect(response.headers.get('Cache-Control')).toBeNull();
  expect((await response.json()).error).toBe('获取番剧日历失败');
});

test('aborts an unresponsive upstream request after ten seconds', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      })
  );
  const pending = GET();
  jest.advanceTimersByTime(10000);
  expect((await pending).status).toBe(502);
  expect(jest.getTimerCount()).toBe(0);
});
