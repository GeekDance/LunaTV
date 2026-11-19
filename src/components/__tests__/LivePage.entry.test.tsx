import { act, render, screen } from '@testing-library/react';

import LivePage from '../pages/LivePage';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
jest.mock('artplayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/lib/db.client', () => ({
  subscribeToDataUpdates: () => () => undefined,
  isFavorited: async () => false,
}));
jest.mock('../PageLayout', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockReplace.mockClear();
  window.history.replaceState(null, '', '/live');
  Object.assign(window, { RUNTIME_CONFIG: { ENABLE_WEB_LIVE: true } });
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => ({ success: true, channelSourceKey: 'demo', channels: [], data: String(url).includes('/sources') ? [{ key: 'demo', name: 'Test live', url: 'https://example.test/list.m3u' }] : [] }),
  })) as jest.Mock;
});
afterEach(() => { jest.useRealTimers(); });

test('shows the live interface when data arrives without an extra one-second delay', async () => {
  render(<LivePage />);
  await act(async () => undefined);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test live');
});

test('entering the live tab does not trigger another server navigation', async () => {
  render(<LivePage />);
  await act(async () => undefined);
  expect(mockReplace).not.toHaveBeenCalled();
});

test('cleans consumed deep-link parameters locally while keeping unrelated query and hash', async () => {
  window.history.replaceState(null, '', '/live?source=demo&id=7&keep=1#section');
  render(<LivePage />);
  await act(async () => undefined);
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/live?keep=1#section');
  expect(mockReplace).not.toHaveBeenCalled();
});


test('reuses channels returned by bootstrap without a second request', async () => {
  render(<LivePage />);
  await act(async () => undefined);
  expect((fetch as jest.Mock).mock.calls.map(([url]) => String(url))).toEqual(['/api/live/sources?includeChannels=1']);
});
