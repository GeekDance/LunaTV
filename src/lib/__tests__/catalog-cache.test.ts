import { cachedCatalog } from '../catalog-cache';

const valid = (value: string) => ({ code: 200, list: [{ id: value }] });
const cacheable = (data: ReturnType<typeof valid>) => data.code === 200;

beforeEach(() => {
  sessionStorage.clear();
});

test('reuses a successful public list within its lifetime', async () => {
  const first = await cachedCatalog(
    'reuse',
    async () => valid('first'),
    cacheable
  );
  const next = await cachedCatalog(
    'reuse',
    async () => valid('second'),
    cacheable
  );
  expect(first.list[0].id).toBe('first');
  expect(next.list[0].id).toBe('first');
});

test('shares a pending request between homepage and category consumers', async () => {
  let finish!: (data: ReturnType<typeof valid>) => void;
  const first = cachedCatalog(
    'pending',
    () =>
      new Promise<ReturnType<typeof valid>>((resolve) => {
        finish = resolve;
      }),
    cacheable
  );
  const second = cachedCatalog(
    'pending',
    async () => valid('duplicate'),
    cacheable
  );
  finish(valid('shared'));
  expect((await first).list[0].id).toBe('shared');
  expect((await second).list[0].id).toBe('shared');
});

test('separates different filters and data providers', async () => {
  await cachedCatalog(
    'provider-a:movie',
    async () => valid('movie'),
    cacheable
  );
  expect(
    (await cachedCatalog('provider-a:tv', async () => valid('tv'), cacheable))
      .list[0].id
  ).toBe('tv');
  expect(
    (
      await cachedCatalog(
        'provider-b:movie',
        async () => valid('other'),
        cacheable
      )
    ).list[0].id
  ).toBe('other');
});

test('does not cache errors or unsuccessful results', async () => {
  await expect(
    cachedCatalog(
      'retry',
      async () => {
        throw new Error('offline');
      },
      cacheable
    )
  ).rejects.toThrow('offline');
  expect(
    (await cachedCatalog('retry', async () => valid('recovered'), cacheable))
      .list[0].id
  ).toBe('recovered');
  await cachedCatalog(
    'invalid',
    async () => ({ code: 500, list: [] }),
    cacheable
  );
  expect(
    (await cachedCatalog('invalid', async () => valid('valid'), cacheable))
      .list[0].id
  ).toBe('valid');
});

test('refreshes expired lists instead of freezing the catalog', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    await cachedCatalog('expire', async () => valid('old'), cacheable);
    now.mockReturnValue(1000 + 6 * 60 * 1000);
    expect(
      (await cachedCatalog('expire', async () => valid('fresh'), cacheable))
        .list[0].id
    ).toBe('fresh');
  } finally {
    now.mockRestore();
  }
});

test('retains public lists across a page reload in the same tab', async () => {
  await cachedCatalog('reload', async () => valid('saved'), cacheable);
  jest.resetModules();
  const freshModule = await import('../catalog-cache');
  expect(
    (
      await freshModule.cachedCatalog(
        'reload',
        async () => valid('network'),
        cacheable
      )
    ).list[0].id
  ).toBe('saved');
});
