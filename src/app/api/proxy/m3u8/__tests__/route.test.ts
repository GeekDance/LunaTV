/** @jest-environment ./test/node-web-environment.cjs */
import { GET } from '../route';

jest.mock('@/lib/live-source', () => ({ getLiveSource: async () => ({ key: 'demo', ua: 'qqlive' }) }));
jest.mock('@/lib/live', () => ({
  getBaseUrl: (url: string) => new URL('.', url).toString(),
  resolveUrl: (base: string, path: string) => new URL(path, base).toString(),
}));

afterEach(() => jest.restoreAllMocks());

test.each([['video/mp4', 'mp4'], ['video/x-flv', 'flv']])('identifies unsupported %s during the actual playback request', async (mime, type) => {
  const cancel = jest.fn().mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'Content-Type': mime }), body: { cancel } });
  const response = await GET(new Request('https://example.test/api/proxy/m3u8?url=https%3A%2F%2Fexample.test%2Flive&moontv-source=demo'));
  expect(response.status).toBe(415);
  expect(response.headers.get('X-MoonTV-Stream-Type')).toBe(type);
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('fetches and rewrites the playable manifest once with the configured UA', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'Content-Type': 'application/vnd.apple.mpegurl' }), url: 'https://example.test/channel/index.m3u8', text: async () => '#EXTM3U\n#EXTINF:5,\nsegment.ts' });
  const response = await GET(new Request('https://example.test/api/proxy/m3u8?url=https%3A%2F%2Fexample.test%2Flive&moontv-source=demo'));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('/api/proxy/segment?url=https%3A%2F%2Fexample.test%2Fchannel%2Fsegment.ts');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('https://example.test/live', expect.objectContaining({ headers: { 'User-Agent': 'qqlive' } }));
});
