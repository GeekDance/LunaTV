/** The category page reads its filters on the client; changing them needs no RSC request. */
export function navigateCategoryLocally(href: string): boolean {
  if (window.location.pathname !== '/douban') return false;
  const destination = new URL(href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    destination.pathname !== '/douban' ||
    !['movie', 'tv', 'anime', 'show', 'custom'].includes(
      destination.searchParams.get('type') || ''
    )
  )
    return false;

  if (destination.href !== window.location.href) {
    // Next.js integrates native history with useSearchParams, including back/forward.
    window.history.pushState(null, '', destination.href);
  }
  return true;
}
