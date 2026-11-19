import { act, render, screen } from '@testing-library/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

import LivePage from '../pages/LivePage';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
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
