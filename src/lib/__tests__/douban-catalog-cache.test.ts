let getDoubanCategories: typeof import('../douban.client').getDoubanCategories;

beforeEach(async () => {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem('doubanDataSource', 'cmliussss-cdn-tencent');
  ({ getDoubanCategories } = await import('../douban.client'));
  let requests = 0;
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          id: String(++requests),
          title: 'Catalog result',
          pic: { normal: '/poster.jpg' },
        },
      ],
    }),
  })) as jest.Mock;
});

test('homepage and first category visit reuse the same first-page list despite parameter order', async () => {
  const home = await getDoubanCategories({
    kind: 'movie',
    category: '热门',
    type: '全部',
    pageLimit: 25,
  });
  const category = await getDoubanCategories({
    pageStart: 0,
    pageLimit: 25,
    type: '全部',
    category: '热门',
    kind: 'movie',
  });
  expect(home.list[0].id).toBe('1');
  expect(category.list[0].id).toBe('1');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('a different page or proxy gets its own data instead of a cached first page', async () => {
  const params = {
    kind: 'tv' as const,
    category: 'tv',
    type: 'tv',
    pageLimit: 25,
  };
  await getDoubanCategories(params);
  expect(
    (await getDoubanCategories({ ...params, pageStart: 25 })).list[0].id
  ).toBe('2');
  localStorage.setItem('doubanDataSource', 'cmliussss-cdn-ali');
  expect((await getDoubanCategories(params)).list[0].id).toBe('3');
});

test('ignores a corrupted persisted list after a reload', async () => {
  const params = { kind: 'movie' as const, category: '热门', type: '全部' };
  await getDoubanCategories(params);
  const saved = JSON.parse(sessionStorage.getItem('lunatv:catalog:v1') || '{}');
  const entry = Object.values(saved)[0] as { data: { list: unknown[] } };
  entry.data.list = [null];
  sessionStorage.setItem('lunatv:catalog:v1', JSON.stringify(saved));
  jest.resetModules();
  const reloaded = await import('../douban.client');
  expect((await reloaded.getDoubanCategories(params)).list[0].id).toBe('2');
});
