/** @jest-environment node */
import { runBatchedSearch } from '../batched-search.client';
import type { SearchPageResponse } from '../search-page.types';
import type { SearchResult } from '../types';

const NativeAbortController = process
  .getBuiltinModule('vm')
  .runInThisContext('globalThis.AbortController');
const NativeResponse = process
  .getBuiltinModule('vm')
  .runInThisContext('globalThis.Response');
function fixture(count: number, pages = 1) {
  const jobs: { source: string; page: number }[] = [];
  let active = 0;
  let maximum = 0;
  let respond: (
    source: string,
    page: number
  ) => Partial<SearchPageResponse> = () => ({});
  const sources = Array.from({ length: count }, (_, i) => ({
    key: `s${i}`,
    name: `Source ${i}`,
  }));
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted)
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const url = new URL(String(input), 'https://test.example');
    if (url.pathname === '/api/search/manifest')
      return {
        ok: true,
        json: async () => ({ sources, maxPages: pages }),
      } as Response;
    if (url.pathname !== '/api/search/page')
      throw new Error(`Unexpected endpoint: ${url.pathname}`);
    const source = url.searchParams.get('source') || '';
    const page = Number(url.searchParams.get('page'));
    jobs.push({ source, page });
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    await Promise.resolve();
    active--;
    const result = {
      id: `${source}-${page}`,
      source,
      source_name: source,
    } as SearchResult;
    return {
      ok: true,
      json: async () => ({
        source,
        page,
        pageCount: pages,
        results: [result],
        ...respond(source, page),
      }),
    } as Response;
  }) as typeof fetch;
  return {
    jobs,
    fetcher,
    maximum: () => maximum,
    respond: (callback: typeof respond) => {
      respond = callback;
    },
  };
}

test('returns all 118 sources with one source-page per request and at most four concurrent requests', async () => {
  const f = fixture(118);
  const completed: string[] = [];
  const results = await runBatchedSearch('example', {
    signal: new NativeAbortController().signal,
    fetcher: f.fetcher,
    onSource: (s) => completed.push(s.source),
  });
  expect(new Set(results.map((r) => r.source)).size).toBe(118);
  expect(f.jobs).toHaveLength(118);
  expect(new Set(completed).size).toBe(118);
  expect(f.maximum()).toBeLessThanOrEqual(4);
  expect(f.maximum()).toBeGreaterThan(1);
});
test('searches every configured page and completes each source only once', async () => {
  const f = fixture(2, 3);
  const completed: string[] = [];
  const results = await runBatchedSearch('example', {
    signal: new NativeAbortController().signal,
    fetcher: f.fetcher,
    onSource: (s) => completed.push(s.source),
  });
  expect(results.map((r) => r.id).sort()).toEqual([
    's0-1',
    's0-2',
    's0-3',
    's1-1',
    's1-2',
    's1-3',
  ]);
  expect(completed.sort()).toEqual(['s0', 's1']);
});
test('continues pagination after an empty valid page', async () => {
  const f = fixture(1, 3);
  f.respond((_source, page) => (page === 1 ? { results: [] } : {}));
  const result = await runBatchedSearch('example', {
    signal: new NativeAbortController().signal,
    fetcher: f.fetcher,
  });
  expect(result.map((r) => r.id)).toEqual(['s0-2', 's0-3']);
});
test('reports a failed page while retaining other pages and other sources', async () => {
  const f = fixture(2, 3);
  f.respond((source, page) =>
    source === 's0' && page === 2 ? { results: [], error: 'Unavailable' } : {}
  );
  const failures: string[] = [];
  const result = await runBatchedSearch('example', {
    signal: new NativeAbortController().signal,
    fetcher: f.fetcher,
    onSource: (s) => {
      if (s.error) failures.push(s.source);
    },
  });
  expect(result.map((r) => r.id).sort()).toEqual([
    's0-1',
    's0-3',
    's1-1',
    's1-2',
    's1-3',
  ]);
  expect(failures).toEqual(['s0']);
});
test('stops scheduling after cancellation and does not publish later source results', async () => {
  const f = fixture(118);
  const controller = new NativeAbortController();
  const published: string[] = [];
  await expect(
    runBatchedSearch('example', {
      signal: controller.signal,
      fetcher: f.fetcher,
      onSource: (s) => {
        published.push(s.source);
        controller.abort();
      },
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(published).toHaveLength(1);
  expect(f.jobs.length).toBeLessThanOrEqual(4);
});
test('does not turn a failed manifest request into an empty successful search', async () => {
  const fetcher: typeof fetch = async () =>
    new NativeResponse('Unauthorized', { status: 401 });
  await expect(
    runBatchedSearch('example', {
      signal: new NativeAbortController().signal,
      fetcher,
    })
  ).rejects.toThrow();
});
test('fetches overlapping pages without rendering duplicate source/item keys', async () => {
  const f = fixture(1, 3);
  f.respond((source) => ({
    results: [
      { id: 'same', source, source_name: 'One source' } as SearchResult,
    ],
  }));
  const result = await runBatchedSearch('example', {
    signal: new NativeAbortController().signal,
    fetcher: f.fetcher,
  });
  expect(f.jobs.map((job) => job.page)).toEqual([1, 2, 3]);
  expect(result.map((row) => row.id)).toEqual(['same']);
});

test('publishes first-page sources before later pages finish while preserving completion callbacks', async () => {
  const f = fixture(1, 2);
  let finish: (() => void) | undefined;
  const progress: string[][] = [],
    completed: string[] = [];
  const fetcher = (async (input, init) => {
    if (String(input).includes('page=2'))
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return f.fetcher(input, init);
  }) as typeof fetch;
  const running = runBatchedSearch('example', {
    signal: new NativeAbortController().signal,
    fetcher,
    onProgress: (s) => progress.push(s.results.map((r) => r.id)),
    onSource: (s) => completed.push(s.source),
  });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(progress).toEqual([['s0-1']]);
  expect(completed).toEqual([]);
  finish?.();
  await running;
  expect(progress).toEqual([['s0-1'], ['s0-1', 's0-2']]);
  expect(completed).toEqual(['s0']);
  expect(f.maximum()).toBeLessThanOrEqual(4);
});
