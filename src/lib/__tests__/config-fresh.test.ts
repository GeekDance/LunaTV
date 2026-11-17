/** @jest-environment node */
const mockGet = jest.fn();
jest.mock('../db', () => ({ db: { getAdminConfig: mockGet } }));

beforeEach(() => {
  jest.resetModules();
  mockGet.mockReset();
  process.env.USERNAME = 'owner';
});

const config = (ua: string) => ({
  ConfigFile: '',
  UserConfig: { Users: [] },
  SourceConfig: [],
  CustomCategories: [],
  LiveConfig: [
    {
      key: 'live',
      name: 'Live',
      url: 'https://example.test/list.m3u',
      ua,
      from: 'custom',
    },
  ],
  SiteConfig: { SiteName: 'Test' },
});

test('fresh admin reads return saved UA instead of a warm old configuration', async () => {
  mockGet
    .mockResolvedValueOnce(config('old-UA'))
    .mockResolvedValueOnce(config('qqlive'));
  const { getConfig } = await import('../config');
  expect((await getConfig()).LiveConfig?.[0].ua).toBe('old-UA');
  expect((await getConfig({ fresh: true })).LiveConfig?.[0].ua).toBe('qqlive');
});

test('fresh admin reads fail instead of reporting old settings as saved when the database is unavailable', async () => {
  mockGet
    .mockResolvedValueOnce(config('old-UA'))
    .mockRejectedValueOnce(new Error('offline'));
  const { getConfig } = await import('../config');
  await getConfig();
  await expect(getConfig({ fresh: true })).rejects.toThrow('offline');
});

export {};
