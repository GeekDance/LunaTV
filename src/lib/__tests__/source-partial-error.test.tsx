import { render, screen } from '@testing-library/react';
import React from 'react';

import EpisodeSelector from '@/components/EpisodeSelector';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

test('keeps available playback sources visible when another source fails', () => {
  localStorage.setItem('enableOptimization', 'false');
  render(
    <EpisodeSelector
      totalEpisodes={1}
      episodes_titles={['Demo']}
      value={1}
      onChange={() => undefined}
      sourceSearchError='One source failed'
      availableSources={[
        {
          id: 'demo',
          title: 'Demo',
          poster: 'https://example.com/poster.jpg',
          source: 'demo',
          source_name: 'Available source',
          year: '2008',
          episodes: ['https://example.com/demo.m3u8'],
          episodes_titles: ['Demo'],
        },
      ]}
    />
  );
  expect(screen.getByText('One source failed')).toBeInTheDocument();
  expect(screen.getByText('Available source')).toBeInTheDocument();
});
