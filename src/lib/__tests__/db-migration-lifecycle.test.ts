/** @jest-environment node */
const mockStorage = {
  migrateData: jest.fn(),
  migratePasswords: jest.fn(),
  getAllFavorites: jest.fn(),
  getAllPlayRecords: jest.fn(),
};
const mockContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: mockContext }));
jest.mock('../upstash.db', () => ({
  UpstashRedisStorage: jest.fn(() => mockStorage),
}));
jest.mock('../redis.db', () => ({ RedisStorage: jest.fn() }));
jest.mock('../kvrocks.db', () => ({ KvrocksStorage: jest.fn() }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockContext.mockImplementation(() => { throw new Error('outside Worker'); });
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'upstash';
  mockStorage.migrateData.mockResolvedValue(undefined);
  mockStorage.migratePasswords.mockResolvedValue(undefined);
  mockStorage.getAllFavorites.mockResolvedValue({});
  mockStorage.getAllPlayRecords.mockResolvedValue({});
});

test('a new Worker request does not wait for an ended request migration', async () => {
  mockContext.mockImplementationOnce(() => ({ ctx: {} }))
    .mockImplementationOnce(() => ({ ctx: {} }));
  mockStorage.migrateData.mockImplementationOnce(() => new Promise<void>(() => undefined));
  const { db } = await import('../db');
  void db.getAllFavorites('owner'); // Simulates work abandoned with its original request.
  const next = db.getAllPlayRecords('owner');
  const state = await Promise.race([
    next.then(() => 'completed'),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 100)),
  ]);
  expect(state).toBe('completed');
  expect(mockStorage.migrateData).toHaveBeenCalledTimes(2);
});
afterAll(() => { delete process.env.NEXT_PUBLIC_STORAGE_TYPE; });

test('starts migration in the awaited data request, not module initialization', async () => {
  const { db } = await import('../db');
  expect(mockStorage.migrateData).not.toHaveBeenCalled();
  await db.getAllFavorites('owner');
  expect(mockStorage.migrateData).toHaveBeenCalledTimes(1);
  expect(mockStorage.migratePasswords).toHaveBeenCalledTimes(1);
});

test('waits for migration once before concurrent and subsequent data reads', async () => {
  let finish!: () => void;
  let started!: () => void;
  const migrationStarted = new Promise<void>(resolve => { started = resolve; });
  mockStorage.migrateData.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; started(); }));
  const { db } = await import('../db');
  const first = db.getAllFavorites('owner');
  const concurrent = db.getAllPlayRecords('owner');
  await migrationStarted;
  expect(mockStorage.getAllFavorites).not.toHaveBeenCalled();
  expect(mockStorage.getAllPlayRecords).not.toHaveBeenCalled();
  finish();
  await Promise.all([first, concurrent]);
  await db.getAllPlayRecords('owner');
  expect(mockStorage.migrateData).toHaveBeenCalledTimes(1);
  expect(mockStorage.getAllPlayRecords).toHaveBeenCalledWith('owner');
});
