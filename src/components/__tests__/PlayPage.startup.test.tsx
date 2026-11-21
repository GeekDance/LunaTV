import { act, fireEvent, render, screen } from '@testing-library/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

import { getAllPlayRecords, savePlayRecord } from '@/lib/db.client';
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
  savePlayRecord: jest.fn().mockResolvedValue(undefined),
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
  default: ({
    onChange,
    onSourceChange,
    availableSources = [],
  }: {
    onChange: (index: number) => void;
    onSourceChange: (source: string, id: string) => void;
    availableSources?: { source: string; id: string }[];
  }) => (
    <div>
      Episode panel<button onClick={() => onChange(0)}>Current episode</button>
      {availableSources.map((source) => (
        <button
          key={source.source}
          onClick={() => onSourceChange(source.source, source.id)}
        >
          Select {source.source}
        </button>
      ))}
    </div>
  ),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => undefined);
  (getVideoResolutionFromM3u8 as jest.Mock).mockReset();
  (Hls as unknown as jest.Mock).mockReset().mockImplementation(() => ({
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

test('recovers when a usable source arrives after the first recovery deadline', async () => {
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
    source: 'late',
    id: '7',
    episodes: ['https://example.test/good.m3u8'],
  };
  let finishSearch: (value: unknown) => void = () => undefined;
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/detail'))
      return { ok: true, json: async () => primary };
    if (url === '/api/search/manifest')
      return {
        ok: true,
        json: async () => ({
          sources: [{ key: 'late', name: 'Late' }],
          maxPages: 1,
        }),
      };
    return new Promise((resolve) => {
      finishSearch = resolve;
    });
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
  await act(async () => {
    jest.advanceTimersByTime(8000);
  });
  expect(screen.getByRole('alert')).toHaveTextContent('暂未找到');
  await act(async () =>
    finishSearch({
      ok: true,
      json: async () => ({
        source: 'late',
        page: 1,
        pageCount: 1,
        results: [fallback],
      }),
    })
  );
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  expect(player.switch).toBe('https://example.test/good.m3u8');
});

const series = (source: string, count = 3) => ({
  source,
  source_name: source,
  id: source === 'selected' ? '42' : '7',
  title: 'Demo',
  year: '2026',
  poster: '',
  episodes: Array.from(
    { length: count },
    (_, i) => `https://example.test/${source}-${i}.m3u8`
  ),
  episodes_titles: Array.from({ length: count }, (_, i) => `Episode ${i + 1}`),
});
function crossSourceFixture() {
  const primary = series('selected'),
    fallback = series('fallback');
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
  (getAllPlayRecords as jest.Mock).mockResolvedValue({
    'selected+42': {
      title: 'Demo',
      year: '2026',
      index: 2,
      play_time: 120,
      save_time: 1,
    },
  });
  (getVideoResolutionFromM3u8 as jest.Mock).mockResolvedValue({
    quality: '1080p',
    loadSpeed: '2 MB/s',
    pingTime: 10,
  });
  return { primary, fallback };
}
function canplay(player: {
  duration: number;
  currentTime: number;
  on: jest.Mock;
}) {
  player.duration = 1000;
  player.on.mock.calls.find(
    ([event]: [string]) => event === 'video:canplay'
  )[1]();
}

test('initial auto selection preserves the requested sources saved episode and time', async () => {
  crossSourceFixture();
  window.history.replaceState(
    null,
    '',
    '/play?source=selected&id=42&title=Demo&year=2026&prefer=true'
  );
  render(<PlayPage />);
  await act(async () => undefined);
  const options = (Artplayer as unknown as jest.Mock).mock.calls[0][0];
  expect(options.url).toBe('https://example.test/fallback-1.m3u8');
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  act(() => canplay(player));
  expect(player.currentTime).toBe(120);
});

test('manual switch before the first seek keeps the pending episode and time', async () => {
  crossSourceFixture();
  render(<PlayPage />);
  await act(async () => undefined);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Select fallback' }))
  );
  expect((Artplayer as unknown as jest.Mock).mock.calls[1][0].url).toBe(
    'https://example.test/fallback-1.m3u8'
  );
  const player = (Artplayer as unknown as jest.Mock).mock.results[1].value;
  act(() => canplay(player));
  expect(player.currentTime).toBe(120);
});

test('fatal HLS teardown cannot erase the live position used by automatic fallback', async () => {
  crossSourceFixture();
  render(<PlayPage />);
  await act(async () => undefined);
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  act(() => canplay(player));
  player.currentTime = 135;
  const options = (Artplayer as unknown as jest.Mock).mock.calls[0][0];
  act(() => options.customType.m3u8(player.video, options.url));
  const hls = (Hls as unknown as jest.Mock).mock.results[0].value;
  hls.destroy.mockImplementation(() => {
    player.currentTime = 0;
  });
  await act(async () =>
    hls.on.mock.calls.find(([event]: [string]) => event === 'error')[1](
      'error',
      { fatal: true, type: 'networkError' }
    )
  );
  expect(player.switch).toBe('https://example.test/fallback-1.m3u8');
  act(() => canplay(player));
  expect(player.currentTime).toBe(135);
});

test('manual source change preserves live progress and saves it on the destination', async () => {
  crossSourceFixture();
  render(<PlayPage />);
  await act(async () => undefined);
  const original = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  act(() => canplay(original));
  original.currentTime = 165;
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Select fallback' }))
  );
  const replacement = (Artplayer as unknown as jest.Mock).mock.results[1].value;
  act(() => canplay(replacement));
  expect(replacement.currentTime).toBe(165);
  await act(async () =>
    replacement.on.mock.calls.find(
      ([event]: [string]) => event === 'pause'
    )[1]()
  );
  expect(savePlayRecord).toHaveBeenCalledWith(
    'fallback',
    '7',
    expect.objectContaining({ index: 2, play_time: 165 })
  );
});

test('switching to a source missing the current episode keeps the existing selection', async () => {
  const { fallback } = crossSourceFixture();
  fallback.episodes.splice(1);
  render(<PlayPage />);
  await act(async () => undefined);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Select fallback' }))
  );
  expect(Artplayer).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('暂无第 2 集');
  expect(window.location.search).toContain('source=selected');
});

test('a deliberate episode change resets pending progress instead of applying the previous episode time', async () => {
  crossSourceFixture();
  render(<PlayPage />);
  await act(async () => undefined);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Current episode' }))
  );
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  expect(player.switch).toBe('https://example.test/selected-0.m3u8');
  act(() => canplay(player));
  expect(player.currentTime).toBe(0);
});

test('a failed seek remains pending for the next source rather than being cleared', async () => {
  crossSourceFixture();
  render(<PlayPage />);
  await act(async () => undefined);
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  Object.defineProperty(player, 'currentTime', {
    configurable: true,
    get: () => 0,
    set: () => {
      throw new Error('not seekable yet');
    },
  });
  act(() => canplay(player));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Select fallback' }))
  );
  const replacement = (Artplayer as unknown as jest.Mock).mock.results[1].value;
  act(() => canplay(replacement));
  expect(replacement.currentTime).toBe(120);
});

test('waits for a later complete source when the first source lacks the saved episode', async () => {
  const { primary, fallback } = crossSourceFixture();
  primary.episodes.splice(1);
  let finish: (value: unknown) => void = () => undefined;
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
    return new Promise((resolve) => {
      finish = resolve;
    });
  }) as jest.Mock;
  render(<PlayPage />);
  await act(async () => undefined);
  expect(screen.queryByText('加载失败')).not.toBeInTheDocument();
  expect(Artplayer).not.toHaveBeenCalled();
  await act(async () =>
    finish({
      ok: true,
      json: async () => ({
        source: 'fallback',
        page: 1,
        pageCount: 1,
        results: [fallback],
      }),
    })
  );
  expect((Artplayer as unknown as jest.Mock).mock.calls[0][0].url).toBe(
    'https://example.test/fallback-1.m3u8'
  );
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  act(() => canplay(player));
  expect(player.currentTime).toBe(120);
});

test('an intentional rewind to zero is saved rather than reviving the previous position', async () => {
  crossSourceFixture();
  render(<PlayPage />);
  await act(async () => undefined);
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  act(() => canplay(player));
  player.currentTime = 0;
  await act(async () =>
    player.on.mock.calls.find(
      ([event]: [string]) => event === 'video:seeked'
    )[1]()
  );
  expect(savePlayRecord).toHaveBeenLastCalledWith(
    'selected',
    '42',
    expect.objectContaining({ index: 2, play_time: 0 })
  );
});
