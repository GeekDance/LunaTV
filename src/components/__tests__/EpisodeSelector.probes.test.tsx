import { act, render } from '@testing-library/react';

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
