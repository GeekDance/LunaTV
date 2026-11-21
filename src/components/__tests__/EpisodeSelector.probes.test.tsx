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
