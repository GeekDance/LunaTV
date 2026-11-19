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
  'switches from %s to a category without server navigation',
  (path) => {
    window.history.replaceState(null, '', path);
    expect(navigateCategoryLocally('/douban?type=show')).toBe(true);
    expect(window.location.pathname + window.location.search).toBe(
      '/douban?type=show'
    );
  }
);

test.each(['/', '/search?q=demo', '/live'])(
  'switches from a category to %s within the browsing workspace',
  (href) => {
    expect(navigateCategoryLocally(href)).toBe(true);
    expect(window.location.pathname + window.location.search).toBe(href);
  }
);

test.each(['/admin', '/play', '/login'])(
  'keeps framework navigation when leaving %s',
  (path) => {
    window.history.replaceState(null, '', path);
    expect(navigateCategoryLocally('/douban?type=movie')).toBe(false);
    expect(window.location.pathname).toBe(path);
  }
);

test.each([
  '/admin',
  '/douban?type=unknown',
  'https://example.org/douban?type=tv',
])('does not intercept other destinations: %s', (href) => {
  expect(navigateCategoryLocally(href)).toBe(false);
  expect(window.location.search).toBe('?type=movie');
});
