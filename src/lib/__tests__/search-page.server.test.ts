/** @jest-environment node */
import { getAvailableApiSites, getConfig } from '../config';
import { getSearchManifest, searchSourcePage } from '../search-page.server';

jest.mock('../config', () => ({
  getConfig: jest.fn(),
  getAvailableApiSites: jest.fn(),
  API_CONFIG: {
    search: { path: '?wd=', pagePath: '?wd={query}&pg={page}', headers: {} },
  },
}));

const config = getConfig as jest.Mock;
const sites = getAvailableApiSites as jest.Mock;
let urls: string[];
let counter = 0;
const site = {
  key: 'visible',
  name: 'Visible source',
  api: 'https://source.example/api',
};
const query = () => `test-${counter++}`;
beforeAll(() => {
  jest.useFakeTimers();
  const native = process.getBuiltinModule('vm').runInThisContext('globalThis');
  Object.defineProperty(globalThis, 'AbortController', {
    configurable: true,
    value: native.AbortController,
  });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  process.env.USERNAME = 'owner';
  urls = [];
  config.mockResolvedValue({
    SiteConfig: { SearchDownstreamMaxPage: 3, DisableYellowFilter: false },
    UserConfig: {
      Users: [
        { username: 'member', banned: false },
        { username: 'banned', banned: true },
      ],
    },
  });
  sites.mockResolvedValue([site]);
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    urls.push(url);
    const page = new URL(url).searchParams.get('pg') || '1';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        pagecount: 3,
        list: [
          {
            vod_id: page,
            vod_name: `Page ${page}`,
            vod_pic: '',
            vod_play_url: 'Demo$https://example.com/demo.m3u8',
            vod_year: '2008',
            type_name: 'Test',
          },
        ],
      }),
    } as Response;
  });
});

test.each([undefined, 'missing', 'banned'])(
  'rejects unapproved user %s before requesting sources',
  async (user) => {
    await expect(getSearchManifest(user)).rejects.toMatchObject({
      status: user ? 403 : 401,
    });
    expect(urls).toEqual([]);
  }
);
test('exposes authorized source names and page limit without API locations', async () => {
  const result = await getSearchManifest('member');
  expect(result).toEqual({
    sources: [{ key: 'visible', name: 'Visible source' }],
    maxPages: 3,
  });
  expect(JSON.stringify(result)).not.toContain('source.example');
});
test.each(['hidden', 'https://private.example/'])(
  'rejects unknown source %s without fetching it',
  async (source) => {
    await expect(
      searchSourcePage('member', query(), source, 1)
    ).rejects.toMatchObject({ status: 403 });
    expect(urls).toEqual([]);
  }
);
test.each([0, -1, 1.5, 4, NaN])(
  'rejects page %s outside the configured integer range',
  async (page) => {
    await expect(
      searchSourcePage('member', query(), 'visible', page)
    ).rejects.toMatchObject({ status: 400 });
    expect(urls).toEqual([]);
  }
);
test('requests only the selected page even if the source has more pages', async () => {
  const result = await searchSourcePage('member', query(), 'visible', 2);
  expect(result.results.map((r) => r.id)).toEqual(['2']);
  expect(result).toMatchObject({ source: 'visible', page: 2 });
  expect(urls).toHaveLength(1);
  expect(new URL(urls[0]).searchParams.get('pg')).toBe('2');
});
test('keeps first-page pagination metadata for an empty valid page', async () => {
  global.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ pagecount: 3, list: [] }),
      } as Response)
  );
  const result = await searchSourcePage('member', query(), 'visible', 1);
  expect(result).toMatchObject({ results: [], pageCount: 3 });
  expect(result.error).toBeUndefined();
});
test('reports upstream failures instead of treating them as successful empty results', async () => {
  global.fetch = jest.fn(async () => {
    throw new Error('Too many subrequests.');
  });
  const result = await searchSourcePage('member', query(), 'visible', 1);
  expect(result.results).toEqual([]);
  expect(result.error).toEqual(expect.any(String));
});
test('does not cache an empty page and hide newly available upstream results', async () => {
  const originalFetch = global.fetch;
  const q = query();
  global.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ pagecount: 3, list: [] }),
      } as Response)
  );
  expect((await searchSourcePage('member', q, 'visible', 1)).results).toEqual(
    []
  );
  global.fetch = originalFetch;
  expect(
    (await searchSourcePage('member', q, 'visible', 1)).results.map((r) => r.id)
  ).toEqual(['1']);
});
test('times out a response whose headers arrive but JSON body never completes', async () => {
  const native = process.getBuiltinModule('vm').runInThisContext('globalThis');
  const { createServer } = process.getBuiltinModule('http');
  let bodyStarted!: () => void;
  const readingBody = new Promise<void>((resolve) => {
    bodyStarted = resolve;
  });
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test listener');
  sites.mockResolvedValue([
    { ...site, api: `http://127.0.0.1:${address.port}/api` },
  ]);
  global.fetch = async (input, init) => {
    const response = await native.fetch(input, init);
    const json = response.json.bind(response);
    response.json = () => {
      bodyStarted();
      return json();
    };
    return response;
  };
  const pending = searchSourcePage('member', query(), 'visible', 1);
  try {
    await readingBody;
    jest.advanceTimersByTime(8001);
    const state = await Promise.race([
      pending.then((result) => (result.error ? 'failed' : 'succeeded')),
      new Promise((resolve) =>
        native.setTimeout(() => resolve('still pending'), 100)
      ),
    ]);
    expect(state).toBe('failed');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pending;
  }
});
