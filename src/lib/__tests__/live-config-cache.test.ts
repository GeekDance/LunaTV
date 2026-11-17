/** @jest-environment node */
const mockGetConfig = jest.fn();
const mockSaveConfig = jest.fn();
jest.mock('../config', () => ({ getConfig: mockGetConfig }));
jest.mock('../db', () => ({ db: { saveAdminConfig: mockSaveConfig } }));

let live: typeof import('../live');
const source = (ua: string) => ({
  key: 'live',
  name: 'Live',
  url: 'https://example.test/list.m3u',
  ua,
  from: 'custom' as const,
});
beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  live = await import('../live');
  global.fetch = jest.fn(async () => ({
    text: async () =>
      '#EXTM3U\n#EXTINF:-1,Demo\nhttps://example.test/stream.m3u8',
  })) as jest.Mock;
});

test('a changed UA invalidates cached channels and is used for the refreshed source request', async () => {
  mockGetConfig.mockResolvedValue({ LiveConfig: [source('old-UA')] });
  await live.getCachedLiveChannels('live');
  mockGetConfig.mockResolvedValue({ LiveConfig: [source('qqlive')] });
  await live.getCachedLiveChannels('live');
  expect(fetch).toHaveBeenLastCalledWith('https://example.test/list.m3u', {
    headers: { 'User-Agent': 'qqlive' },
  });
});

test('reading channels never overwrites persisted admin settings', async () => {
  mockGetConfig.mockResolvedValue({ LiveConfig: [source('qqlive')] });
  expect((await live.getCachedLiveChannels('live'))?.channelNumber).toBe(1);
  expect(mockSaveConfig).not.toHaveBeenCalled();
});

export {};
