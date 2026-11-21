import { act, fireEvent, render, screen } from '@testing-library/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

import { getAllPlayRecords } from '@/lib/db.client';
import { getVideoResolutionFromM3u8 } from '@/lib/utils';

import PlayPage from '@/app/play/page';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('hls.js', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    DefaultConfig: { loader: class {} },
    Events: { ERROR: 'error' },
    ErrorTypes: { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' },
  }),
}));
jest.mock('artplayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/lib/db.client', () => ({
  getAllPlayRecords: jest.fn(),
  saveSkipConfig: jest.fn().mockResolvedValue(undefined),
  deleteSkipConfig: jest.fn().mockResolvedValue(undefined),
  deletePlayRecord: jest.fn().mockResolvedValue(undefined),
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
  default: ({ onChange }: { onChange: (index: number) => void }) => (
    <div>
      Episode panel<button onClick={() => onChange(0)}>Current episode</button>
    </div>
  ),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => undefined);
  (getVideoResolutionFromM3u8 as jest.Mock).mockReset();
  (Hls as unknown as jest.Mock)
    .mockReset()
    .mockImplementation(() => ({
      on: jest.fn(),
      loadSource: jest.fn(),
      attachMedia: jest.fn(),
      destroy: jest.fn(),
      recoverMediaError: jest.fn(),
      startLoad: jest.fn(),
    }));
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
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

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
  window.history.replaceState(
    null,
    '',
    '/play?source=selected&id=42&title=Demo&year=2026'
  );
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/detail'))
      return {
        ok: true,
        json: async () => ({
          source: 'selected',
          id: '42',
          title: '',
          year: 'unknown',
          episodes: [],
        }),
      };
    if (url === '/api/search/manifest')
      return {
        ok: true,
        json: async () => ({
          sources: [{ key: 'fallback', name: 'Fallback' }],
          maxPages: 1,
        }),
      };
    return {
      ok: true,
      json: async () => ({
        source: 'fallback',
        page: 1,
        pageCount: 1,
        results: [
          {
            source: 'fallback',
            id: '7',
            title: 'Demo',
            year: '2026',
            poster: '',
            episodes: ['https://example.test/fallback.m3u8'],
            episodes_titles: ['Episode 1'],
          },
        ],
      }),
    };
  }) as jest.Mock;
  render(<PlayPage />);
  await act(async () => undefined);
  expect(screen.getByText('Episode panel')).toBeInTheDocument();
  expect((Artplayer as unknown as jest.Mock).mock.calls[0][0].url).toBe(
    'https://example.test/fallback.m3u8'
  );
});

test('ends endless startup loading and offers retry when no stream produces a frame', async () => {
  render(<PlayPage />);
  await act(async () => undefined);
  expect(screen.getByText(/视频加载中/)).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(12000);
  });
  expect(screen.queryByText(/视频加载中/)).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(8000);
  });
  expect(
    screen.getByRole('button', { name: '重新尝试播放' })
  ).toBeInTheDocument();
});

test('a fatal HLS network error ends loading instead of restarting the failed stream forever', async () => {
  render(<PlayPage />);
  await act(async () => undefined);
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  const options = (Artplayer as unknown as jest.Mock).mock.calls[0][0];
  act(() => options.customType.m3u8(player.video, options.url));
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  const errorHandler = hls.on.mock.calls.find(
    ([event]: [string]) => event === 'error'
  )[1];
  await act(async () =>
    errorHandler('error', { fatal: true, type: 'networkError' })
  );
  expect(hls.startLoad).not.toHaveBeenCalled();
  expect(hls.destroy).toHaveBeenCalled();
  expect(screen.queryByText(/视频加载中/)).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('a verified alternative replaces a stalled stream and a real frame clears recovery state', async () => {
  const primary = {
    source: 'selected',
    id: '42',
    title: 'Demo',
    year: '2026',
    episodes: ['https://example.test/bad.m3u8'],
    episodes_titles: ['Episode 1'],
  };
  const fallback = {
    ...primary,
    source: 'fallback',
    id: '7',
    episodes: ['https://example.test/good.m3u8'],
  };
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/detail'))
      return { ok: true, json: async () => primary };
    if (url === '/api/search/manifest')
      return {
        ok: true,
        json: async () => ({
          sources: [{ key: 'fallback', name: 'Fallback' }],
          maxPages: 1,
        }),
      };
    return {
      ok: true,
      json: async () => ({
        source: 'fallback',
        page: 1,
        pageCount: 1,
        results: [fallback],
      }),
    };
  }) as jest.Mock;
  (getVideoResolutionFromM3u8 as jest.Mock).mockResolvedValue({
    quality: '1080p',
    loadSpeed: '2 MB/s',
    pingTime: 10,
  });
  render(<PlayPage />);
  await act(async () => undefined);
  await act(async () => {
    jest.advanceTimersByTime(12000);
  });
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  expect(player.switch).toBe('https://example.test/good.m3u8');
  Object.defineProperty(player.video, 'readyState', { value: 4 });
  await act(async () => player.video.dispatchEvent(new Event('canplay')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText(/视频加载中/)).not.toBeInTheDocument();
});

test('the retry action creates a fresh player after recovery has no usable source', async () => {
  render(<PlayPage />);
  await act(async () => undefined);
  await act(async () => {
    jest.advanceTimersByTime(12000);
  });
  await act(async () => {
    jest.advanceTimersByTime(8000);
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: '重新尝试播放' }))
  );
  expect(Artplayer).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText(/视频加载中/)).toBeInTheDocument();
});

test('selecting the current episode does not cancel its failure deadline', async () => {
  render(<PlayPage />);
  await act(async () => undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Current episode' }));
  await act(async () => {
    jest.advanceTimersByTime(12000);
  });
  expect(screen.queryByText(/视频加载中/)).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
