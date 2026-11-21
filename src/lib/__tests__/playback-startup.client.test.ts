import {
  probePlaybackSources,
  startPlayback,
} from '../playback-startup.client';
import type { SearchResult } from '../types';

const source = (id: string) =>
  ({
    id,
    source: id,
    title: 'Demo',
    episodes: [`https://example.test/${id}.m3u8`],
  } as SearchResult);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
afterEach(() => jest.useRealTimers());

test('explicit details start playback while alternatives are unresolved and survive search failure', async () => {
  const alternative = deferred<SearchResult[]>();
  const primary = source('primary');
  const updates: SearchResult[][] = [];
  const selected = await startPlayback({
    signal: new AbortController().signal,
    explicit: true,
    fetchDetail: async () => primary,
    search: async () => alternative.promise,
    onSources: (sources) => updates.push(sources),
    optimize: false,
  });
  expect(selected).toBe(primary);
  expect(updates.at(-1)).toEqual([primary]);
  alternative.resolve([source('other')]);
  await flush();
  expect(updates.at(-1)?.map((s) => s.id)).toEqual(['primary', 'other']);
});

test('starts from a matching progressive result without waiting for the final slow source', async () => {
  const later = deferred<SearchResult[]>();
  const first = source('first');
  const result = await startPlayback({
    signal: new AbortController().signal,
    explicit: false,
    search: async (onResults) => {
      onResults([first]);
      return later.promise;
    },
    optimize: false,
  });
  expect(result).toBe(first);
  later.resolve([source('later')]);
});

test('falls back to search if the requested detail is unavailable', async () => {
  const fallback = source('fallback');
  expect(
    await startPlayback({
      signal: new AbortController().signal,
      explicit: true,
      fetchDetail: async () => {
        throw new Error('unavailable');
      },
      search: async () => [fallback],
      optimize: false,
    })
  ).toBe(fallback);
});

test('bounds candidate gathering and preference to three seconds then keeps alternatives in the background', async () => {
  jest.useFakeTimers();
  const first = source('first');
  const ongoing = deferred<SearchResult[]>();
  const preferSignals: AbortSignal[] = [];
  const result = startPlayback({
    signal: new AbortController().signal,
    explicit: false,
    optimize: true,
    search: async (onResults) => {
      onResults([first, source('second')]);
      return ongoing.promise;
    },
    probe: async (_source, signal) => {
      preferSignals.push(signal);
      return new Promise(() => undefined);
    },
    choose: (_results, sources) => sources[0],
  });
  await flush();
  jest.advanceTimersByTime(250);
  await flush();
  jest.advanceTimersByTime(2750);
  await flush();
  expect(await result).toBe(first);
  expect(preferSignals[0].aborted).toBe(true);
  ongoing.resolve([]);
});

test('cancels pending selection and ignores late search results after leaving', async () => {
  const controller = new AbortController();
  const search = deferred<SearchResult[]>();
  const updates = jest.fn();
  const result = startPlayback({
    signal: controller.signal,
    explicit: false,
    optimize: false,
    search: async () => search.promise,
    onSources: updates,
  });
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  search.resolve([source('late')]);
  await flush();
  expect(updates).not.toHaveBeenCalled();
});

test('limits probes to four concurrent workers and cancels outstanding work at the deadline', async () => {
  jest.useFakeTimers();
  const signals: AbortSignal[] = [];
  const completed = source('fast');
  const result = probePlaybackSources(
    [completed, ...Array.from({ length: 9 }, (_, i) => source(String(i)))],
    async (s, signal) => {
      signals.push(signal);
      if (s === completed)
        return { quality: '720p', loadSpeed: '1 MB/s', pingTime: 20 };
      return new Promise(() => undefined);
    },
    new AbortController().signal,
    1000
  );
  await flush();
  expect(signals).toHaveLength(5); // one completed probe plus four active workers
  jest.advanceTimersByTime(1000);
  await flush();
  expect((await result).map((r) => r.source.id)).toEqual(['fast']);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

test('retains the better completed probe when another source reaches the deadline', async () => {
  jest.useFakeTimers();
  const sources = [source('weak'), source('best'), source('stalled')];
  const ongoing = deferred<SearchResult[]>();
  const result = startPlayback({
    signal: new AbortController().signal,
    explicit: false,
    optimize: true,
    search: async (onResults) => {
      onResults(sources);
      return ongoing.promise;
    },
    probe: async (s) => {
      if (s.id === 'stalled') return new Promise(() => undefined);
      return {
        quality: '720p',
        loadSpeed: '1 MB/s',
        pingTime: s.id === 'best' ? 10 : 300,
      };
    },
    choose: (results, entries) =>
      results.sort((a, b) => a.testResult.pingTime - b.testResult.pingTime)[0]
        ?.source || entries[0],
  });
  await flush();
  jest.advanceTimersByTime(250);
  await flush();
  jest.advanceTimersByTime(2750);
  await flush();
  expect((await result).id).toBe('best');
  ongoing.resolve([]);
});

test('an explicit preference request still falls back to its known detail when search has no match', async () => {
  const detail = source('known');
  expect(
    await startPlayback({
      signal: new AbortController().signal,
      explicit: false,
      optimize: true,
      search: async () => [],
      fetchDetail: async () => detail,
    })
  ).toBe(detail);
});
