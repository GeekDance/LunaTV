import { render, screen } from '@testing-library/react';

import BrowsePageBoundary from '../BrowsePageBoundary';

function BrokenChunk(): never {
  throw new Error('Loading page chunk failed');
}

test('keeps a recoverable page fallback when a lazy page chunk fails', () => {
  const error = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  try {
    render(
      <BrowsePageBoundary fallback={<button>重新加载页面</button>}>
        <BrokenChunk />
      </BrowsePageBoundary>
    );
    expect(
      screen.getByRole('button', { name: '重新加载页面' })
    ).toBeInTheDocument();
  } finally {
    error.mockRestore();
  }
});
