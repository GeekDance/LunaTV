/** @jest-environment ./test/node-web-environment.cjs */
import { NextRequest } from 'next/server';

import { GET } from '../route';

const mockGetConfig = jest.fn();
jest.mock('@/lib/config', () => ({ getConfig: (...args: unknown[]) => mockGetConfig(...args) }));

beforeEach(() => {
  mockGetConfig.mockReset();
  mockGetConfig.mockResolvedValue({ LiveConfig: [
    { key: 'off', name: 'Disabled', url: 'https://example.test/off.m3u', disabled: true },
    { key: 'demo', name: 'Demo', url: 'https://example.test/list.m3u', ua: 'qqlive' },
    { key: 'other', name: 'Other', url: 'https://example.test/other.m3u', ua: 'other-UA' },
  ] });
  global.fetch = jest.fn().mockResolvedValue({ text: async () => '#EXTM3U\n#EXTINF:-1,Demo\nhttps://example.test/stream.m3u8' });
});

test('bootstraps enabled sources and initial channels from one fresh config read', async () => {
  const response = await GET(new NextRequest('https://example.test/api/live/sources?includeChannels=1'));
  const result = await response.json();
  expect(result.data.map((source: { key: string }) => source.key)).toEqual(['demo', 'other']);
  expect(result.channelSourceKey).toBe('demo');
  expect(result.channels).toHaveLength(1);
  expect(mockGetConfig).toHaveBeenCalledTimes(1);
  expect(mockGetConfig).toHaveBeenCalledWith({ fresh: true });
  expect(fetch).toHaveBeenCalledWith('https://example.test/list.m3u', { headers: { 'User-Agent': 'qqlive' } });
});

test('bootstraps the deep-linked enabled source', async () => {
  const result = await (await GET(new NextRequest('https://example.test/api/live/sources?includeChannels=1&source=other'))).json();
  expect(result.channelSourceKey).toBe('other');
  expect(fetch).toHaveBeenCalledWith('https://example.test/other.m3u', { headers: { 'User-Agent': 'other-UA' } });
});
