import type { SearchManifest, SearchPageResponse } from './search-page.types';
import type { SearchResult } from './types';

export interface SourceSearchOutcome {
  source: string;
  sourceName: string;
  results: SearchResult[];
  error?: string;
}

interface Options {
  signal: AbortSignal;
  fetcher?: typeof fetch;
  onStart?: (sources: number) => void;
  onSource?: (outcome: SourceSearchOutcome) => void;
}

export async function runBatchedSearch(
  query: string,
  options: Options
): Promise<SearchResult[]> {
  const { signal, onStart, onSource } = options;
  const fetcher = options.fetcher || fetch;
  const checkAbort = () => {
    if (signal.aborted)
      throw Object.assign(new Error('搜索已取消'), { name: 'AbortError' });
  };
  const requestOptions: RequestInit = {
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  };
  checkAbort();
  const response = await fetcher('/api/search/manifest', requestOptions);
  if (!response.ok) throw new Error('搜索配置读取失败');
  const manifest = (await response.json()) as SearchManifest;
  checkAbort();
  if (
    !Array.isArray(manifest.sources) ||
    !Number.isFinite(manifest.maxPages) ||
    manifest.maxPages < 1
  )
    throw new Error('搜索配置无效');
  onStart?.(manifest.sources.length);
  const states = manifest.sources.map((source) => ({
    source: source.key,
    sourceName: source.name,
    results: [] as SearchResult[],
    seenIds: new Set<string>(),
    error: undefined as string | undefined,
    nextPage: 1,
    lastPage: 1,
  }));
  const queue = [...states];
  const work = async () => {
    while (queue.length) {
      checkAbort();
      const state = queue.shift();
      if (!state) return;
      const page = state.nextPage;
      try {
        const params = new URLSearchParams({
          q: query,
          source: state.source,
          page: String(page),
        });
        const pageResponse = await fetcher(
          `/api/search/page?${params}`,
          requestOptions
        );
        if (!pageResponse.ok) throw new Error('来源暂时不可用');
        const data = (await pageResponse.json()) as SearchPageResponse;
        checkAbort();
        if (!Array.isArray(data.results)) throw new Error('来源响应无效');
        for (const result of data.results) {
          if (!state.seenIds.has(result.id)) {
            state.seenIds.add(result.id);
            state.results.push(result);
          }
        }
        if (data.error) state.error = data.error;
        if (page === 1) {
          const reported = Number(data.pageCount);
          const pages =
            Number.isFinite(reported) && reported >= 1
              ? Math.floor(reported)
              : 1;
          state.lastPage = Math.min(pages, Math.floor(manifest.maxPages));
        }
      } catch (error) {
        checkAbort();
        state.error = error instanceof Error ? error.message : '来源请求失败';
      }
      checkAbort();
      state.nextPage++;
      if (state.nextPage <= state.lastPage) {
        // Queue only the next page, never allocate all configured pages up front.
        queue.push(state);
      } else {
        onSource?.({
          source: state.source,
          sourceName: state.sourceName,
          results: state.results,
          error: state.error,
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, states.length) }, () => work())
  );
  checkAbort();
  return states.flatMap((state) => state.results);
}
