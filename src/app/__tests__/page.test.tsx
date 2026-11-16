import { render, screen } from '@testing-library/react';

import { GetBangumiCalendarData } from '@/lib/bangumi.client';
import { getDoubanCategories } from '@/lib/douban.client';

import Home from '../page';

jest.mock('@/lib/bangumi.client', () => ({
  GetBangumiCalendarData: jest.fn(),
}));
jest.mock('@/lib/douban.client', () => ({ getDoubanCategories: jest.fn() }));
jest.mock('@/lib/db.client', () => ({}));
jest.mock('@/components/SiteProvider', () => ({
  useSite: () => ({ announcement: '' }),
}));
jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
jest.mock('@/components/ScrollableRow', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@/components/ContinueWatching', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/VideoCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (getDoubanCategories as jest.Mock).mockImplementation(
    async ({ kind, category }) => ({
      code: 200,
      list: [
        {
          id: '1',
          title:
            kind === 'movie'
              ? 'Movie result'
              : category === 'tv'
              ? 'TV result'
              : 'Variety result',
          poster: '/poster.jpg',
        },
      ],
    })
  );
});

afterEach(() => jest.restoreAllMocks());

test('renders successful movie, TV and variety results when the calendar fails', async () => {
  (GetBangumiCalendarData as jest.Mock).mockRejectedValue(
    new Error('calendar unavailable')
  );
  render(<Home />);
  expect(await screen.findByText('Movie result')).toBeInTheDocument();
  expect(screen.getByText('TV result')).toBeInTheDocument();
  expect(screen.getByText('Variety result')).toBeInTheDocument();
});

test('renders successful sections when one Douban request fails', async () => {
  (GetBangumiCalendarData as jest.Mock).mockResolvedValue([]);
  (getDoubanCategories as jest.Mock).mockImplementation(
    async ({ kind, category }) => {
      if (kind === 'movie') throw new Error('movie unavailable');
      return {
        code: 200,
        list: [
          {
            id: '2',
            title: category === 'tv' ? 'TV result' : 'Variety result',
            poster: '/poster.jpg',
          },
        ],
      };
    }
  );
  render(<Home />);
  expect(await screen.findByText('TV result')).toBeInTheDocument();
  expect(screen.getByText('Variety result')).toBeInTheDocument();
});
