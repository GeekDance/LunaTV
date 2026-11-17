import { navigateCategoryLocally } from '../category-navigation';

beforeEach(() => {
  window.history.replaceState(null, '', '/douban?type=movie');
});

test('switches the mounted category page immediately through browser history', () => {
  expect(navigateCategoryLocally('/douban?type=tv')).toBe(true);
  expect(window.location.pathname + window.location.search).toBe(
    '/douban?type=tv'
  );
});

test('keeps a browser history entry for back navigation without duplicating the current category', () => {
  const originalLength = window.history.length;
  navigateCategoryLocally('/douban?type=anime');
  expect(window.history.length).toBe(originalLength + 1);
  navigateCategoryLocally('/douban?type=anime');
  expect(window.history.length).toBe(originalLength + 1);
});

test.each(['/', '/search', '/live'])(
  'leaves navigation from %s to the framework',
  (path) => {
    window.history.replaceState(null, '', path);
    expect(navigateCategoryLocally('/douban?type=show')).toBe(false);
    expect(window.location.pathname).toBe(path);
  }
);

test.each([
  '/live',
  '/douban?type=unknown',
  'https://example.org/douban?type=tv',
])('does not intercept other destinations: %s', (href) => {
  expect(navigateCategoryLocally(href)).toBe(false);
  expect(window.location.search).toBe('?type=movie');
});
