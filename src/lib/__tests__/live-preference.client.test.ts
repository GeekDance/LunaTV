import { findRememberedLiveChannel, readLastLiveChannel, rememberLiveChannel } from '../live-preference.client';

let mockUsername: string | undefined;
jest.mock('../auth', () => ({ getAuthInfoFromBrowserCookie: () => ({ username: mockUsername }) }));

beforeEach(() => { localStorage.clear(); mockUsername = undefined; });
afterEach(() => jest.restoreAllMocks());

test('finds the same station after positional channel IDs change', () => {
  rememberLiveChannel('demo', { id: 'demo-1', name: 'News', tvgId: 'news' });
  const channels = [{ id: 'demo-1', name: 'Other', tvgId: 'other' }, { id: 'demo-9', name: 'News', tvgId: 'news' }];
  expect(findRememberedLiveChannel('demo', channels)).toBe(channels[1]);
});

test('does not restore a removed channel or a different source', () => {
  rememberLiveChannel('demo', { id: 'demo-1', name: 'News' });
  expect(findRememberedLiveChannel('demo', [{ id: 'demo-1', name: 'Other' }])).toBeUndefined();
  expect(findRememberedLiveChannel('other', [{ id: 'demo-1', name: 'News' }])).toBeUndefined();
});

test('isolates preferences by signed-in account', () => {
  mockUsername = 'alice';
  rememberLiveChannel('demo', { id: '1', name: 'News' });
  mockUsername = 'bob';
  expect(readLastLiveChannel()).toBeNull();
  mockUsername = 'alice';
  expect(readLastLiveChannel()?.name).toBe('News');
});

test('ignores malformed data and tolerates unavailable browser storage', () => {
  localStorage.setItem('lunatv:last-live:guest:v1', '{broken');
  expect(readLastLiveChannel()).toBeNull();
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
  expect(() => rememberLiveChannel('demo', { id: '1', name: 'News' })).not.toThrow();
});
