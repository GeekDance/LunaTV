/** @jest-environment node */
const mockGetConfig = jest.fn();
jest.mock('../config', () => ({ getConfig: mockGetConfig }));
const config = (ua: string) => ({ LiveConfig: [{ key: 'live', ua }] });
let getLiveSource: typeof import('../live-source').getLiveSource;
beforeEach(async () => {
  jest.resetModules();
  mockGetConfig.mockReset();
  ({ getLiveSource } = await import('../live-source'));
});

test('a segment on another warm worker refreshes stale UA before using it', async () => {
  mockGetConfig
    .mockResolvedValueOnce(config('old-UA'))
    .mockResolvedValueOnce(config('qqlive'));
  expect((await getLiveSource('live', 'qqlive'))?.ua).toBe('qqlive');
});

test('an untrusted client hint never becomes the upstream UA', async () => {
  mockGetConfig.mockResolvedValue(config('qqlive'));
  expect((await getLiveSource('live', 'arbitrary-client-value'))?.ua).toBe(
    'qqlive'
  );
});

test('matching UA does not force database reads for every segment', async () => {
  mockGetConfig.mockResolvedValue(config('qqlive'));
  await getLiveSource('live', 'qqlive');
  await getLiveSource('live', 'qqlive');
  expect(mockGetConfig.mock.calls).toEqual([[], []]);
});

test('a verified stale hint does not cause a fresh database read on every segment', async () => {
  mockGetConfig.mockResolvedValue(config('qqlive'));
  await getLiveSource('live', 'old-UA', 'same-playback');
  await getLiveSource('live', 'old-UA', 'same-playback');
  expect(mockGetConfig.mock.calls).toEqual([[], [{ fresh: true }], []]);
});

export {};

test('a new playback revalidates a UA that was changed away and then back', async () => {
  mockGetConfig.mockResolvedValue(config('B'));
  await getLiveSource('live', 'A', 'old-playback');
  mockGetConfig
    .mockResolvedValueOnce(config('B'))
    .mockResolvedValueOnce(config('A'));
  expect((await getLiveSource('live', 'A', 'new-playback'))?.ua).toBe('A');
});
