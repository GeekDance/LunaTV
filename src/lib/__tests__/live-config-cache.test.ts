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

test('channel loading does not wait for a stalled program guide', async () => {
  mockGetConfig.mockResolvedValue({ LiveConfig: [{ ...source('qqlive'), epg: 'https://example.test/guide.xml' }] });
  (fetch as jest.Mock).mockImplementation(async (url) => {
    if (String(url).endsWith('guide.xml')) return new Promise(() => undefined);
    return { ok: true, text: async () => '#EXTM3U\n#EXTINF:-1 tvg-id="demo",Demo\nhttps://example.test/stream.m3u8' };
  });
  const state = await Promise.race([
    live.getCachedLiveChannels('live').then(result => result?.channels.length === 1 ? 'ready' : 'empty'),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 100)),
  ]);
  expect(state).toBe('ready');
});


test('loads the program guide on demand with the source UA and reuses the result', async () => {
  mockGetConfig.mockResolvedValue({ LiveConfig: [{ ...source('qqlive'), epg: 'https://example.test/guide.xml' }] });
  (fetch as jest.Mock).mockImplementation(async (url) => {
    if (!String(url).endsWith('guide.xml')) return { text: async () => '#EXTM3U\n#EXTINF:-1 tvg-id="demo",Demo\nhttps://example.test/stream.m3u8' };
    let consumed = false;
    return { ok: true, body: { getReader: () => ({ read: async () => {
      if (consumed) return { done: true };
      consumed = true;
      return { done: false, value: Buffer.from('<programme channel="demo" start="20261119000000 +0800" stop="20261119010000 +0800">\n<title>Demo show</title>\n</programme>\n') };
    } }) } };
  });
  await live.getCachedLiveChannels('live');
  expect(fetch).toHaveBeenCalledTimes(1);
  const result = await live.getCachedLiveChannels('live', { includeEpg: true });
  expect(result?.epgs.demo?.[0].title).toBe('Demo show');
  expect(fetch).toHaveBeenLastCalledWith('https://example.test/guide.xml', { headers: { 'User-Agent': 'qqlive' } });
  await live.getCachedLiveChannels('live', { includeEpg: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});


test('overlapping program-guide requests share one download', async () => {
  mockGetConfig.mockResolvedValue({ LiveConfig: [{ ...source('qqlive'), epg: 'https://example.test/guide.xml' }] });
  let releaseGuide: (value: unknown) => void = () => undefined;
  const guide = new Promise(resolve => { releaseGuide = resolve; });
  (fetch as jest.Mock).mockImplementation(async (url) => {
    if (String(url).endsWith('guide.xml')) return guide;
    return { text: async () => '#EXTM3U\n#EXTINF:-1 tvg-id="demo",Demo\nhttps://example.test/stream.m3u8' };
  });
  await live.getCachedLiveChannels('live');
  const requests = [live.getCachedLiveChannels('live', { includeEpg: true }), live.getCachedLiveChannels('live', { includeEpg: true })];
  await new Promise(resolve => setImmediate(resolve));
  expect(fetch).toHaveBeenCalledTimes(2);
  releaseGuide({ ok: true, body: null });
  await Promise.all(requests);
  expect(fetch).toHaveBeenCalledTimes(2);
});
