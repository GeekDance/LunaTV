/** @jest-environment node */
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'util';

import { D1Storage } from '../d1.db';

const database = new DatabaseSync(':memory:');
database.exec(
  'CREATE TABLE lunatv_storage (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
);
const sql = {
  prepare(query: string) {
    const statement = database.prepare(query);
    const bound = (values: unknown[] = []) => ({
      bind: (...args: unknown[]) => bound(args),
      first: async <T>() => (statement.get(...(values as [])) as T) || null,
      all: async <T>() => ({ results: statement.all(...(values as [])) as T[] }),
      run: async () => statement.run(...(values as [])),
    });
    return bound();
  },
};
let storage: D1Storage;
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'TextEncoder', {
    value: TextEncoder,
    configurable: true,
  });
});
beforeEach(() => {
  database.exec('DELETE FROM lunatv_storage');
  storage = new D1Storage(async () => sql);
});
afterAll(() => database.close());

test('keeps playback records isolated by user even when usernames contain separators', async () => {
  const record = { title: 'Example', index: 1 } as never;
  await storage.setPlayRecord('alice', 'source+1', record);
  await storage.setPlayRecord('alice/other', 'source+2', record);
  expect(await storage.getAllPlayRecords('alice')).toEqual({
    'source+1': record,
  });
  await storage.deleteAllPlayRecords('alice');
  expect(await storage.getPlayRecord('alice/other', 'source+2')).toEqual(
    record
  );
});

test('persists administrator configuration across storage instances', async () => {
  const config = { SourceConfig: [{ key: 'example' }] } as never;
  await storage.setAdminConfig(config);
  expect(await new D1Storage(async () => sql).getAdminConfig()).toEqual(config);
});

test('stores salted password hashes and verifies correct and incorrect passwords', async () => {
  await storage.registerUser('alice', 'example-strong-password');
  expect(await storage.verifyUser('alice', 'example-strong-password')).toBe(
    true
  );
  expect(await storage.verifyUser('alice', 'wrong')).toBe(false);
  const rows = database.prepare('SELECT value FROM lunatv_storage').all();
  expect(JSON.stringify(rows)).not.toContain('example-strong-password');
  expect(await storage.getAllUsers()).toEqual(['alice']);
});

test('deduplicates search history and keeps the latest twenty entries', async () => {
  for (let i = 0; i < 22; i++)
    await storage.addSearchHistory('alice', String(i));
  await storage.addSearchHistory('alice', '20');
  const history = await storage.getSearchHistory('alice');
  expect(history).toHaveLength(20);
  expect(history.slice(0, 3)).toEqual(['20', '21', '19']);
  await storage.deleteSearchHistory('alice', '20');
  expect(await storage.getSearchHistory('alice')).not.toContain('20');
});
