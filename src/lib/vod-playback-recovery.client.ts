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
  allowLateSources?: boolean;
  onSearching?: () => void;
}) {
  let controller = new AbortController();
  const queue: { source: SearchResult; url: string }[] = [];
  const seenSources = new Set<string>();
  const seenUrls = new Set<string>();
  let active = 0;
  let stopped = false;
  let expired = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    controller.abort();
    queue.length = 0;
  };
  const expire = () => {
    if (stopped) return;
    if (!options.allowLateSources) stop();
    else {
      expired = true;
      controller.abort();
      active = 0;
      // Unstarted candidates may be offered again in a later progressive batch.
      for (const entry of queue) {
        seenSources.delete(
          JSON.stringify([entry.source.source, entry.source.id])
        );
        seenUrls.delete(entry.url);
      }
      queue.length = 0;
    }
    options.onExhausted();
  };
  let timer = setTimeout(expire, options.timeoutMs ?? 8000);
  const pump = () => {
    while (!stopped && !expired && active < 4 && queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      active++;
      const roundController = controller;
      Promise.resolve()
        .then(() => {
          if (roundController.signal.aborted)
            throw new Error('Recovery canceled');
          return options.probe(entry.url, roundController.signal);
        })
        .then(
          (info) => {
            if (controller !== roundController || stopped || expired) return;
            active--;
            stop();
            options.onFound(entry.source, info);
          },
          () => {
            if (controller !== roundController || stopped || expired) return;
            active--;
            pump();
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
      if (expired && queue.length) {
        expired = false;
        controller = new AbortController();
        timer = setTimeout(expire, options.timeoutMs ?? 8000);
        options.onSearching?.();
      }
      pump();
    },
    cancel: stop,
  };
}
