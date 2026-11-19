import { act, render, screen } from '@testing-library/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

import LivePage from '../pages/LivePage';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
jest.mock('artplayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hls.js', () => {
  const Hls = Object.assign(jest.fn(), { DefaultConfig: { loader: class {} }, Events: { ERROR: 'error' }, ErrorTypes: { NETWORK_ERROR: 'networkError' } });
  return { __esModule: true, default: Hls };
});
jest.mock('@/lib/db.client', () => ({ subscribeToDataUpdates: () => () => undefined, isFavorited: async () => false }));
jest.mock('../PageLayout', () => ({ __esModule: true, default: ({ children }: React.PropsWithChildren) => <main>{children}</main> }));

const mockHlsError = { current: null as null | ((event: string, data: unknown) => void) };
const mockDestroy = jest.fn();
const mockStartLoad = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.useFakeTimers();
  HTMLElement.prototype.scrollTo = jest.fn();
  mockHlsError.current = null;
  window.history.replaceState(null, '', '/live');
  Object.assign(window, { RUNTIME_CONFIG: { ENABLE_WEB_LIVE: true } });
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  (Hls as unknown as jest.Mock).mockImplementation(() => ({ loadSource: jest.fn(), attachMedia: jest.fn(), destroy: mockDestroy, startLoad: mockStartLoad, on: (_event: string, cb: typeof mockHlsError.current) => { mockHlsError.current = cb; } }));
  (Artplayer as unknown as jest.Mock).mockImplementation((options) => {
    const video = document.createElement('video');
    options.container.appendChild(video);
    options.customType.m3u8(video, options.url);
    return { video, on: jest.fn(), off: jest.fn(), destroy: jest.fn() };
  });
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/precheck')) return new Promise(() => undefined);
    return { ok: true, json: async () => ({ success: true, data: String(url).includes('/sources') ? [{ key: 'demo', name: 'Test live', url: 'https://example.test/list.m3u', ua: 'qqlive' }] : [{ id: '1', name: 'Demo', group: 'Test', url: 'https://example.test/stream', logo: '' }] }) };
  }) as jest.Mock;
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('starts actual playback without waiting for a separate upstream precheck', async () => {
  render(<LivePage />);
  await act(async () => undefined);
  expect(Artplayer).toHaveBeenCalledTimes(1);
  expect((Artplayer as unknown as jest.Mock).mock.calls[0][0].url).toContain('/api/proxy/m3u8?');
  expect((fetch as jest.Mock).mock.calls.some(([url]) => String(url).includes('/precheck'))).toBe(false);
});

test('retains unsupported-format feedback from the playback response and stops retries', async () => {
  render(<LivePage />);
  await act(async () => undefined);
  expect(mockHlsError.current).not.toBeNull();
  act(() => mockHlsError.current?.('error', { fatal: true, type: 'networkError', networkDetails: { getResponseHeader: () => 'flv' } }));
  expect(screen.getByText(/FLV/i)).toBeInTheDocument();
  expect(mockDestroy).toHaveBeenCalled();
  expect(mockStartLoad).not.toHaveBeenCalled();
});

test('restores the last played channel instead of the first channel', async () => {
  localStorage.setItem('lunatv:last-live:guest:v1', JSON.stringify({ sourceKey: 'demo', id: '2', name: 'News', tvgId: 'news' }));
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true,
    data: [{ key: 'demo', name: 'Test live', url: 'https://example.test/list.m3u' }], channelSourceKey: 'demo',
    channels: [{ id: '1', name: '4K test', group: 'Test', url: 'https://example.test/test' }, { id: '2', name: 'News', tvgId: 'news', group: 'News', url: 'https://example.test/news' }] }) })) as jest.Mock;
  render(<LivePage />);
  await act(async () => undefined);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test live > News');
  expect((Artplayer as unknown as jest.Mock).mock.calls[0][0].url).toContain(encodeURIComponent('https://example.test/news'));
});

test('remembers a channel only after actual playback starts and stores no stream URL', async () => {
  localStorage.clear();
  render(<LivePage />);
  await act(async () => undefined);
  expect(localStorage.getItem('lunatv:last-live:guest:v1')).toBeNull();
  const player = (Artplayer as unknown as jest.Mock).mock.results[0].value;
  const playing = player.on.mock.calls.find(([event]: [string]) => event === 'video:playing')?.[1];
  expect(playing).toBeDefined();
  act(() => playing());
  expect(JSON.parse(localStorage.getItem('lunatv:last-live:guest:v1') || 'null')).toEqual({ sourceKey: 'demo', id: '1', name: 'Demo', tvgId: 'Demo' });
});


test('an explicit channel link wins over the remembered channel', async () => {
  localStorage.setItem('lunatv:last-live:guest:v1', JSON.stringify({ sourceKey: 'demo', id: '2', name: 'News', tvgId: 'news' }));
  window.history.replaceState(null, '', '/live?source=demo&id=1');
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true,
    data: [{ key: 'demo', name: 'Test live', url: 'https://example.test/list.m3u' }], channelSourceKey: 'demo',
    channels: [{ id: '1', name: 'Linked channel', group: 'Test', url: 'https://example.test/linked' }, { id: '2', name: 'News', tvgId: 'news', group: 'News', url: 'https://example.test/news' }] }) })) as jest.Mock;
  render(<LivePage />);
  await act(async () => undefined);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test live > Linked channel');
});
