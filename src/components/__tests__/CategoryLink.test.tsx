import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import mockRouter from 'next-router-mock';

import { BrowseNavigationContext } from '../BrowseNavigationContext';
import CategoryLink from '../CategoryLink';

function menu(mounted: boolean) {
  return render(
    <RouterContext.Provider value={mockRouter}>
      <BrowseNavigationContext.Provider value={mounted}>
        <CategoryLink href='/douban?type=movie'>电影</CategoryLink>
      </BrowseNavigationContext.Provider>
    </RouterContext.Provider>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.scrollTo = jest.fn();
});

test('does not change native history while only a server loading shell is mounted', () => {
  menu(false);
  fireEvent.click(screen.getByRole('link', { name: '电影' }));
  expect(window.location.pathname).toBe('/');
});

test('uses native history when a browsing workspace can render the destination', () => {
  menu(true);
  fireEvent.click(screen.getByRole('link', { name: '电影' }));
  expect(window.location.pathname + window.location.search).toBe(
    '/douban?type=movie'
  );
});
