import { act, render, screen } from '@testing-library/react';
import Artplayer from 'artplayer';

import { getAllPlayRecords } from '@/lib/db.client';

import PlayPage from '@/app/play/page';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('artplayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/lib/db.client', () => ({
  getAllPlayRecords: jest.fn(),
  getSkipConfig: async () => null,
  isFavorited: async () => false,
  subscribeToDataUpdates: () => () => undefined,
  generateStorageKey: (source: string, id: string) => `${source}+${id}`,
}));
jest.mock('@/lib/utils', () => ({
  getVideoResolutionFromM3u8: jest.fn(),
  processImageUrl: (url: string) => url,
}));
jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
jest.mock('@/components/EpisodeSelector', () => ({
  __esModule: true,
  default: () => <div>Episode panel</div>,
}));

beforeEach(() => {
  jest.useFakeTimers();
  (getAllPlayRecords as jest.Mock).mockReset().mockResolvedValue({});
  (Artplayer as unknown as jest.Mock).mockClear();
  window.history.replaceState(
    null,
    '',
    '/play?source=selected&id=42&title=Demo'
  );
  (Artplayer as unknown as jest.Mock).mockImplementation(() => ({
    video: document.createElement('video'),
    on: jest.fn(),
    off: jest.fn(),
    destroy: jest.fn(),
    paused: true,
  }));
  global.fetch = jest.fn(async (url) => {
    if (String(url).startsWith('/api/detail'))
      return {
        ok: true,
        json: async () => ({
          source: 'selected',
          id: '42',
          title: 'Demo',
          year: '2026',
          poster: '',
          episodes: ['https://example.test/video.m3u8'],
          episodes_titles: ['Episode 1'],
        }),
      };
    return new Promise(() => undefined);
  }) as jest.Mock;
});
afterEach(() => jest.useRealTimers());

test('renders the requested player immediately after detail while alternative search is unresolved', async () => {
  render(<PlayPage />);
  await act(async () => undefined);
  expect(screen.getByText('Episode panel')).toBeInTheDocument();
  expect(Artplayer).toHaveBeenCalled();
  expect((fetch as jest.Mock).mock.calls[0][0]).toBe(
    '/api/detail?source=selected&id=42'
  );
});

test('loads history concurrently and waits for it before starting the requested player', async () => {
  let finishHistory: (value: unknown) => void = () => undefined;
  (getAllPlayRecords as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      finishHistory = resolve;
    })
  );
  render(<PlayPage />);
  await act(async () => undefined);
  expect(Artplayer).not.toHaveBeenCalled();
  await act(async () => {
    finishHistory({ 'selected+42': { index: 1, play_time: 120 } });
  });
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  player.duration = 1000;
  const canplay = player.on.mock.calls.find(
    ([event]: [string]) => event === 'video:canplay'
  )[1];
  act(() => canplay());
  expect(player.currentTime).toBe(120);
});

test('an unusable detail does not overwrite the title and year needed for fallback search', async () => {
  window.history.replaceState(null, '', '/play?source=selected&id=42&title=Demo&year=2026');
  global.fetch = jest.fn(async input => {
    const url = String(input);
    if (url.startsWith('/api/detail')) return { ok: true, json: async () => ({ source: 'selected', id: '42', title: '', year: 'unknown', episodes: [] }) };
    if (url === '/api/search/manifest') return { ok: true, json: async () => ({ sources: [{ key: 'fallback', name: 'Fallback' }], maxPages: 1 }) };
    return { ok: true, json: async () => ({ source: 'fallback', page: 1, pageCount: 1, results: [{ source: 'fallback', id: '7', title: 'Demo', year: '2026', poster: '', episodes: ['https://example.test/fallback.m3u8'], episodes_titles: ['Episode 1'] }] }) };
  }) as jest.Mock;
  render(<PlayPage />);
  await act(async () => undefined);
  expect(screen.getByText('Episode panel')).toBeInTheDocument();
  expect((Artplayer as unknown as jest.Mock).mock.calls[0][0].url).toBe('https://example.test/fallback.m3u8');
});
