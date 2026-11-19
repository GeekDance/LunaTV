export const loadSearchPage = () => import('@/components/pages/SearchPage');
export const loadLivePage = () => import('@/components/pages/LivePage');

export function preloadBrowseRoute(href: string) {
  const path = href.split('?')[0];
  const load =
    path === '/search'
      ? loadSearchPage
      : path === '/live'
      ? loadLivePage
      : null;
  if (load)
    void load().catch(() => {
      /* A click can retry; failed preloads do not interrupt the current view. */
    });
}
