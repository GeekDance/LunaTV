import { GetBangumiCalendarData } from '../bangumi.client';

const valid = { id: 1, name: 'Valid anime', images: { large: '/poster.jpg' } };

beforeEach(() => {
  global.fetch = jest.fn();
});

test('excludes entries with null images before they reach the homepage', async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [
      { weekday: { en: 'Mon' }, items: [valid, { id: 498559, images: null }] },
    ],
  });
  const result = await GetBangumiCalendarData();
  expect(result[0].items.map((item) => item.id)).toEqual([1]);
});

test('rejects unsuccessful calendar responses', async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 502,
    json: async () => [],
  });
  await expect(GetBangumiCalendarData()).rejects.toThrow('502');
});

test('rejects malformed calendar responses', async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ error: 'unavailable' }),
  });
  await expect(GetBangumiCalendarData()).rejects.toThrow();
});
