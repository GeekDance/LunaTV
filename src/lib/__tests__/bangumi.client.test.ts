let GetBangumiCalendarData: typeof import('../bangumi.client').GetBangumiCalendarData;

const valid = { id: 1, name: 'Valid anime', images: { large: '/poster.jpg' } };

beforeEach(async () => {
  jest.resetModules();
  sessionStorage.clear();
  ({ GetBangumiCalendarData } = await import('../bangumi.client'));
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

test('ignores a persisted calendar with malformed days after a reload', async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [{ weekday: { en: 'Mon' }, items: [valid] }],
  });
  await GetBangumiCalendarData();
  const saved = JSON.parse(sessionStorage.getItem('lunatv:catalog:v1') || '{}');
  saved['bangumi:calendar'].data = [{}];
  sessionStorage.setItem('lunatv:catalog:v1', JSON.stringify(saved));
  jest.resetModules();
  const reloaded = await import('../bangumi.client');
  const result = await reloaded.GetBangumiCalendarData();
  expect(result[0].weekday.en).toBe('Mon');
  expect(result[0].items[0].id).toBe(1);
});
