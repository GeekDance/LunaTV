import type { SearchResult } from './types';

export interface PlaybackProbe {
  quality: string;
  loadSpeed: string;
  pingTime: number;
}
export interface ProbedSource {
  source: SearchResult;
  testResult: PlaybackProbe;
}
const abortError = () =>
  Object.assign(new Error('播放加载已取消'), { name: 'AbortError' });

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

interface StartupOptions {
  signal: AbortSignal;
  explicit: boolean;
  fetchDetail?: () => Promise<SearchResult>;
  search: (
    onResults: (results: SearchResult[]) => void
  ) => Promise<SearchResult[]>;
  optimize: boolean;
  probe?: (source: SearchResult, signal: AbortSignal) => Promise<PlaybackProbe>;
  choose?: (results: ProbedSource[], sources: SearchResult[]) => SearchResult;
  onSources?: (sources: SearchResult[]) => void;
  onSearchError?: (error: unknown) => void;
  onSearchLoading?: (loading: boolean) => void;
  onPreferring?: () => void;
}

export async function startPlayback(
  options: StartupOptions
): Promise<SearchResult> {
  const { signal } = options;
  if (signal.aborted) throw abortError();
  const candidates = new Map<string, SearchResult>();
  let firstReady: () => void = () => undefined;
  const first = new Promise<void>((resolve) => {
    firstReady = resolve;
  });
  const usable = (source: SearchResult) =>
    !!source.source && !!source.id && source.episodes?.some(Boolean);
  const add = (sources: SearchResult[]) => {
    if (signal.aborted) return;
    let changed = false;
    for (const source of sources) {
      if (!usable(source)) continue;
      const key = JSON.stringify([source.source, source.id]);
      if (!candidates.has(key)) {
        candidates.set(key, source);
        changed = true;
      }
    }
    if (changed) options.onSources?.(Array.from(candidates.values()));
    if (candidates.size) firstReady();
  };
  let searchStarted = false;
  const search = () => {
    if (signal.aborted) throw abortError();
    if (searchStarted) throw new Error('Search already started');
    searchStarted = true;
    options.onSearchLoading?.(true);
    return Promise.resolve()
      .then(() => options.search(add))
      .then(add)
      .catch((error) => {
        if (!signal.aborted) options.onSearchError?.(error);
      })
      .finally(() => {
        firstReady();
        if (!signal.aborted) options.onSearchLoading?.(false);
      });
  };

  if (options.explicit && options.fetchDetail) {
    try {
      const detail = await abortable(options.fetchDetail(), signal);
      if (signal.aborted) throw abortError();
      if (usable(detail)) {
        add([detail]);
        // Search only updates alternatives; its completion never changes this selection.
        void search();
        return detail;
      }
    } catch (error) {
      if (signal.aborted) throw abortError();
      // A failed explicit source may still be available from another provider.
    }
  }

  const searchDone = search();
  await abortable(first, signal);
  if (!candidates.size && !options.explicit && options.fetchDetail) {
    try {
      const detail = await abortable(options.fetchDetail(), signal);
      if (signal.aborted) throw abortError();
      if (usable(detail)) {
        add([detail]);
        return detail;
      }
    } catch (error) {
      if (signal.aborted) throw abortError();
    }
  }
  if (!candidates.size) throw new Error('未找到匹配结果');
  if (!options.optimize || !options.probe || !options.choose)
    return Array.from(candidates.values())[0];

  // Gathering and probing share a single budget. The probe pool owns its timeout so
  // completed measurements remain available when unfinished probes are canceled.
  const deadline = Date.now() + 3000;
  let gatherTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await abortable(
      Promise.race([
        searchDone,
        new Promise<void>((resolve) => {
          gatherTimer = setTimeout(resolve, 250);
        }),
      ]),
      signal
    );
    const snapshot = Array.from(candidates.values());
    if (snapshot.length === 1) return snapshot[0];
    options.onPreferring?.();
    const results = await probePlaybackSources(
      snapshot,
      options.probe,
      signal,
      Math.max(0, deadline - Date.now())
    );
    if (signal.aborted) throw abortError();
    return options.choose(results, snapshot);
  } finally {
    if (gatherTimer !== undefined) clearTimeout(gatherTimer);
  }
}

export async function probePlaybackSources(
  sources: SearchResult[],
  probe: (source: SearchResult, signal: AbortSignal) => Promise<PlaybackProbe>,
  signal: AbortSignal,
  budgetMs: number
): Promise<ProbedSource[]> {
  if (signal.aborted) throw abortError();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const results: (ProbedSource | undefined)[] = new Array(sources.length);
  let cursor = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const workers = Array.from(
    { length: Math.min(4, sources.length) },
    async () => {
      while (!controller.signal.aborted && cursor < sources.length) {
        const index = cursor++;
        try {
          const testResult = await probe(sources[index], controller.signal);
          if (!controller.signal.aborted)
            results[index] = { source: sources[index], testResult };
        } catch {
          /* A failed probe must not prevent playback. */
        }
      }
    }
  );
  try {
    await abortable(
      Promise.race([
        Promise.all(workers),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve();
          }, Math.max(0, budgetMs));
        }),
      ]),
      signal
    );
    return results.filter((result): result is ProbedSource => !!result);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    controller.abort();
  }
}
