import type { PlaybackProbe } from './playback-startup.client';
import type { SearchResult } from './types';

/** A metadata/player shell is not success: wait for a decodable video frame. */
export function watchVodPlayback(
  video: HTMLVideoElement,
  options: {
    onReady: () => void;
    onFailure: (reason: 'timeout' | 'error') => void;
    timeoutMs?: number;
  }
) {
  let canceled = false;
  let ready = false;
  let failed = false;
  const notifyReady = () => {
    if (canceled || failed || ready || video.readyState < 2) return;
    ready = true;
    clearTimeout(timer);
    options.onReady();
  };
  const fail = (reason: 'timeout' | 'error' = 'error') => {
    if (canceled || failed) return;
    failed = true;
    clearTimeout(timer);
    options.onFailure(reason);
  };
  const onError = () => fail();
  const timer = setTimeout(() => {
    if (video.readyState >= 2) notifyReady();
    else fail('timeout');
  }, options.timeoutMs ?? 12000);
  video.addEventListener('loadeddata', notifyReady);
  video.addEventListener('canplay', notifyReady);
  video.addEventListener('playing', notifyReady);
  video.addEventListener('error', onError);
  return {
    fail,
    notifyReady,
    cancel() {
      canceled = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', notifyReady);
      video.removeEventListener('canplay', notifyReady);
      video.removeEventListener('playing', notifyReady);
      video.removeEventListener('error', onError);
    },
  };
}

/** Feed progressive search results into one bounded pool; only a verified stream wins. */
export function createVodFallback(options: {
  urlFor: (source: SearchResult) => string | undefined;
  allowed: (source: SearchResult, url: string) => boolean;
  probe: (url: string, signal: AbortSignal) => Promise<PlaybackProbe>;
  onFound: (source: SearchResult, info: PlaybackProbe) => void;
  onExhausted: () => void;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const queue: { source: SearchResult; url: string }[] = [];
  const seenSources = new Set<string>();
  const seenUrls = new Set<string>();
  let active = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    controller.abort();
    queue.length = 0;
  };
  const timer = setTimeout(() => {
    if (stopped) return;
    stop();
    options.onExhausted();
  }, options.timeoutMs ?? 8000);
  const pump = () => {
    while (!stopped && active < 4 && queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      active++;
      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) throw new Error('Recovery canceled');
          return options.probe(entry.url, controller.signal);
        })
        .then(
          (info) => {
            active--;
            if (stopped) return;
            stop();
            options.onFound(entry.source, info);
          },
          () => {
            active--;
            if (!stopped) pump();
          }
        );
    }
  };
  return {
    offer(sources: SearchResult[]) {
      if (stopped) return;
      for (const source of sources) {
        const key = JSON.stringify([source.source, source.id]);
        const url = options.urlFor(source);
        if (
          !url ||
          seenSources.has(key) ||
          seenUrls.has(url) ||
          !options.allowed(source, url)
        )
          continue;
        seenSources.add(key);
        seenUrls.add(url);
        queue.push({ source, url });
      }
      pump();
    },
    cancel: stop,
  };
}
