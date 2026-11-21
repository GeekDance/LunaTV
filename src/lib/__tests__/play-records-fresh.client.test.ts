import { getAllPlayRecords } from '../db.client';

jest.mock('../auth', () => ({
  getAuthInfoFromBrowserCookie: () => ({ username: 'resume-test' }),
}));
const previousStorage = process.env.STORAGE_TYPE;
// db.client reads this on import; Jest hoists mock/imports, so use isolated loading below.
test('fresh resume lookup waits for server history instead of returning hour-old browser cache', async () => {
  process.env.STORAGE_TYPE = 'upstash';
  localStorage.setItem(
    'moontv_cache_resume-test',
    JSON.stringify({
      playRecords: {
        version: '1.0.0',
        timestamp: Date.now(),
        data: { 'a+1': { play_time: 10 } },
      },
    })
  );
  let finish: (value: Response) => void = () => undefined;
  global.fetch = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let read: typeof getAllPlayRecords = getAllPlayRecords;
  jest.isolateModules(() => {
    read = jest.requireActual('../db.client').getAllPlayRecords;
  });
  let resolved = false;
  const result = read({ fresh: true }).then((value) => {
    resolved = true;
    return value;
  });
  await Promise.resolve();
  expect(resolved).toBe(false);
  finish({
    ok: true,
    json: async () => ({ 'b+2': { play_time: 135 } }),
  } as Response);
  expect(await result).toEqual({ 'b+2': { play_time: 135 } });
  if (previousStorage === undefined) delete process.env.STORAGE_TYPE;
  else process.env.STORAGE_TYPE = previousStorage;
  localStorage.clear();
});
