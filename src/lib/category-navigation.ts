const browsePaths = new Set(['/', '/douban', '/search', '/live']);

/** Mounted browsing views consume pathname/search params directly, without an RSC round-trip. */
export function navigateCategoryLocally(href: string): boolean {
  if (!browsePaths.has(window.location.pathname)) return false;
  const destination = new URL(href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    !browsePaths.has(destination.pathname) ||
    (destination.pathname === '/douban' &&
      !['movie', 'tv', 'anime', 'show', 'custom'].includes(
        destination.searchParams.get('type') || ''
      ))
  )
    return false;

  if (destination.href !== window.location.href) {
    // Next.js integrates native history with useSearchParams, including back/forward.
    window.history.pushState(null, '', destination.href);
  }
  return true;
}
