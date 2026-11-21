/** @jest-environment node */
import { getDetailFromApi } from '../downstream';

jest.mock('../config', () => ({ API_CONFIG: { detail: { path: '?ac=videolist&ids=', headers: {} } } }));
const site = { key: 'demo', name: 'Demo', api: 'https://example.test/api', detail: 'https://example.test/web' };
const playable = () => ({ ok: true, json: async () => ({ list: [{ vod_name: 'Demo', vod_pic: '', vod_year: '2026', vod_play_url: 'HD$https://example.test/movie.m3u8', vod_content: '' }] }) });

test('falls back to the same source API when its optional HTML detail page returns 404', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce(playable());
  const result = await getDetailFromApi(site, '42');
  expect(result.source).toBe('demo');
  expect(result.episodes).toEqual(['https://example.test/movie.m3u8']);
  expect(fetch).toHaveBeenLastCalledWith('https://example.test/api?ac=videolist&ids=42', expect.anything());
});

test('falls back when the optional detail page has no playable episodes', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, text: async () => '<html>Unavailable</html>' }).mockResolvedValueOnce(playable());
  expect((await getDetailFromApi(site, '42')).episodes).toHaveLength(1);
});

test('keeps a working special detail parser without an extra API request', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, text: async () => '<h1>Demo</h1>$https://example.test/movie.m3u8' });
  expect((await getDetailFromApi(site, '42')).episodes).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});
