import { act, fireEvent, render, screen } from '@testing-library/react';

import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8 } from '@/lib/utils';

import EpisodeSelector from '../EpisodeSelector';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/lib/utils', () => ({
  getVideoResolutionFromM3u8: jest.fn(),
  processImageUrl: (url: string) => url,
}));

const sources = (count: number) =>
  Array.from(
    { length: count },
    (_, id) =>
      ({
        source: `s${id}`,
        id: String(id),
        title: 'Demo',
        source_name: `Source ${id}`,
        year: '2026',
        episodes: ['https://example.test/media.m3u8'],
        episodes_titles: ['Episode 1'],
        poster: '',
      } as SearchResult)
  );

test('keeps at most four source-card probes during progressive updates and cancels them on exit', async () => {
  localStorage.clear();
  let active = 0;
  let maximum = 0;
  (getVideoResolutionFromM3u8 as jest.Mock).mockImplementation(
    (_url, signal?: AbortSignal) => {
      active++;
      maximum = Math.max(maximum, active);
      return new Promise((_resolve, reject) =>
        signal?.addEventListener(
          'abort',
          () => {
            active--;
            reject(
              Object.assign(new Error('canceled'), { name: 'AbortError' })
            );
          },
          { once: true }
        )
      );
    }
  );
  const view = render(
    <EpisodeSelector
      totalEpisodes={1}
      episodes_titles={['Episode 1']}
      availableSources={sources(10)}
    />
  );
  await act(async () => undefined);
  expect(maximum).toBeLessThanOrEqual(4);
  view.rerender(
    <EpisodeSelector
      totalEpisodes={1}
      episodes_titles={['Episode 1']}
      availableSources={sources(20)}
    />
  );
  await act(async () => undefined);
  expect(maximum).toBeLessThanOrEqual(4);
  view.unmount();
  await act(async () => undefined);
  expect(active).toBe(0);
});

test('defers card probes until playback is ready and cancels them during recovery', async () => {
  (getVideoResolutionFromM3u8 as jest.Mock).mockReset();
  const signals: AbortSignal[] = [];
  (getVideoResolutionFromM3u8 as jest.Mock).mockImplementation(
    (_url, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () =>
            reject(
              Object.assign(new Error('canceled'), { name: 'AbortError' })
            ),
          { once: true }
        )
      );
    }
  );
  const props = {
    totalEpisodes: 1,
    episodes_titles: ['Episode 1'],
    availableSources: sources(10),
  };
  const view = render(<EpisodeSelector {...props} probeEnabled={false} />);
  await act(async () => undefined);
  expect(signals).toHaveLength(0);
  view.rerender(<EpisodeSelector {...props} probeEnabled />);
  await act(async () => undefined);
  expect(signals).toHaveLength(4);
  view.rerender(<EpisodeSelector {...props} probeEnabled={false} />);
  await act(async () => undefined);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  view.unmount();
});

test('shows and selects sources during search, appends later results, and never changes selection on its own', async () => {
  const first = sources(2);
  Object.freeze(first);
  const choose = jest.fn();
  const props = {
    totalEpisodes: 1,
    episodes_titles: ['Episode 1'],
    probeEnabled: false,
    sourceSearchLoading: true,
    currentSource: 's1',
    currentId: '1',
    onSourceChange: choose,
  };
  const view = render(<EpisodeSelector {...props} availableSources={first} />);
  expect(screen.getByText('Source 0')).toBeInTheDocument();
  expect(screen.getByText('Source 1')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('继续搜索');
  fireEvent.click(screen.getByText('Source 0'));
  expect(choose).toHaveBeenCalledWith('s0', '0', 'Demo');
  view.rerender(
    <EpisodeSelector
      {...props}
      currentSource='s0'
      currentId='0'
      availableSources={sources(3)}
      sourceSearchError='部分来源暂不可用'
    />
  );
  expect(screen.getByText('Source 2')).toBeInTheDocument();
  expect(screen.getByText('Source 0')).toBeInTheDocument();
  expect(choose).toHaveBeenCalledTimes(1);
  view.rerender(
    <EpisodeSelector
      {...props}
      sourceSearchLoading={false}
      availableSources={sources(3)}
    />
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getAllByRole('heading', { name: 'Demo' })).toHaveLength(3);
  view.unmount();
});

test('does not show an empty state before discovery finishes', () => {
  const props = {
    totalEpisodes: 1,
    episodes_titles: ['Episode 1'],
    probeEnabled: false,
  };
  const view = render(
    <EpisodeSelector {...props} sourceSearchLoading availableSources={[]} />
  );
  expect(screen.queryByText('暂无可用的换源')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('搜索中');
  view.rerender(<EpisodeSelector {...props} availableSources={[]} />);
  expect(screen.getByText('暂无可用的换源')).toBeInTheDocument();
});

test('reorders source cards as measurements arrive while pinning the current source', async () => {
  const all = sources(6);
  Object.freeze(all);
  const results = new Map([
    [
      's1-1',
      { quality: '错误', loadSpeed: '未知', pingTime: 0, hasError: true },
    ],
    [
      's2-2',
      {
        quality: '1080p',
        loadSpeed: '900 KB/s',
        pingTime: 10,
        startupTimeMs: 900,
      },
    ],
    [
      's3-3',
      {
        quality: '1080p',
        loadSpeed: '2 MB/s',
        pingTime: 15,
        startupTimeMs: 200,
      },
    ],
    [
      's4-4',
      { quality: '错误', loadSpeed: '未知', pingTime: 0, hasError: true },
    ],
    [
      's5-5',
      {
        quality: '1080p',
        loadSpeed: '2 MB/s',
        pingTime: 5,
        startupTimeMs: 100,
      },
    ],
  ]);
  const choose = jest.fn();
  const props = {
    totalEpisodes: 1,
    episodes_titles: ['Episode 1'],
    probeEnabled: false,
    sourceSearchLoading: true,
    currentSource: 's4',
    currentId: '4',
    onSourceChange: choose,
  };
  const view = render(
    <EpisodeSelector
      {...props}
      availableSources={all}
      precomputedVideoInfo={results}
    />
  );
  await act(async () => undefined);
  const order = () =>
    screen.getAllByText(/^Source \d$/).map((element) => element.textContent);
  expect(order()).toEqual([
    'Source 4',
    'Source 5',
    'Source 3',
    'Source 2',
    'Source 0',
    'Source 1',
  ]);
  fireEvent.click(screen.getByText('Source 3'));
  expect(choose).toHaveBeenCalledWith('s3', '3', 'Demo');
  const updated = new Map(results);
  updated.set('s0-0', {
    quality: '1080p',
    loadSpeed: '8 MB/s',
    pingTime: 10,
    startupTimeMs: 50,
  });
  view.rerender(
    <EpisodeSelector
      {...props}
      availableSources={all}
      precomputedVideoInfo={updated}
    />
  );
  await act(async () => undefined);
  expect(order()).toEqual([
    'Source 4',
    'Source 0',
    'Source 5',
    'Source 3',
    'Source 2',
    'Source 1',
  ]);
  expect(choose).toHaveBeenCalledTimes(1);
  expect(all[0].source).toBe('s0');
  view.unmount();
});

test('cache and unmeasurable sources stay playable without fake bandwidth or ping labels', async () => {
  const info = new Map([
    [
      's0-0',
      {
        quality: '1080p',
        loadSpeed: '缓存命中',
        pingTime: 0,
        speedStatus: 'cached' as const,
        loadTimeMs: 2,
        startupTimeMs: 320,
      },
    ],
    [
      's1-1',
      {
        quality: '1080p',
        loadSpeed: '速度不可测',
        pingTime: 0,
        speedStatus: 'unavailable' as const,
        loadTimeMs: 450,
        startupTimeMs: 780,
      },
    ],
  ]);
  render(
    <EpisodeSelector
      totalEpisodes={1}
      episodes_titles={['Episode 1']}
      availableSources={sources(2)}
      precomputedVideoInfo={info}
      probeEnabled={false}
    />
  );
  await act(async () => undefined);
  expect(screen.getByText('起播 320ms')).toHaveAttribute(
    'title',
    expect.stringContaining('首帧可用')
  );
  expect(screen.getByText('起播 780ms')).toBeInTheDocument();
  expect(screen.queryByText('速度不可测')).not.toBeInTheDocument();
  expect(screen.queryByText('首片 2ms')).not.toBeInTheDocument();
  expect(screen.queryByText('检测失败')).not.toBeInTheDocument();
  expect(screen.queryByText('0ms')).not.toBeInTheDocument();
});

test('measures the selected episode and discards stale measurements when episodes change', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: jest.fn(),
  });
  localStorage.clear();
  const rows = sources(1);
  rows[0].episodes = [
    'https://example.test/first.m3u8',
    'https://example.test/second.m3u8',
    'https://example.test/third.m3u8',
  ];
  const probe = getVideoResolutionFromM3u8 as jest.Mock;
  probe
    .mockReset()
    .mockResolvedValue({
      quality: '1080p',
      loadSpeed: '速度不可测',
      pingTime: 0,
      startupTimeMs: 100,
    });
  const stale = new Map([
    [
      's0-0',
      {
        quality: '1080p',
        loadSpeed: '未知',
        pingTime: 0,
        startupTimeMs: 50,
        episodeIndex: 1,
      },
    ],
  ]);
  const view = render(
    <EpisodeSelector
      totalEpisodes={3}
      episodes_titles={['1', '2', '3']}
      value={1}
      availableSources={rows}
      openSourcesRequest={1}
      precomputedVideoInfo={stale}
    />
  );
  await act(async () => undefined);
  expect(probe.mock.calls[0][0]).toBe('https://example.test/first.m3u8');
  expect(screen.queryByText('起播 50ms')).not.toBeInTheDocument();
  view.rerender(
    <EpisodeSelector
      totalEpisodes={3}
      episodes_titles={['1', '2', '3']}
      value={3}
      availableSources={rows}
      openSourcesRequest={1}
      precomputedVideoInfo={stale}
    />
  );
  await act(async () => undefined);
  expect(probe).toHaveBeenCalledTimes(2);
  expect(probe.mock.calls[1][0]).toBe('https://example.test/third.m3u8');
  expect(screen.getByText('起播 100ms')).toBeInTheDocument();
  view.unmount();
});
