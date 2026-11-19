'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { loadLivePage, loadSearchPage } from '@/lib/browse-preload';

import { BrowseNavigationContext } from './BrowseNavigationContext';
import BrowsePageBoundary from './BrowsePageBoundary';
import PageLayout from './PageLayout';
import CatalogPage from './pages/CatalogPage';
import HomePage from './pages/HomePage';

function BrowseLoading({ failed = false }: { failed?: boolean }) {
  const pathname = usePathname();
  return (
    <PageLayout activePath={pathname}>
      <div className='px-4 py-8 sm:px-10' role='status'>
        <p className='text-gray-500'>
          {failed ? '页面暂未加载成功' : '正在打开…'}
        </p>
        {failed && (
          <button
            className='mt-4 text-green-600'
            onClick={() => window.location.reload()}
          >
            重新加载页面
          </button>
        )}
      </div>
    </PageLayout>
  );
}

const SearchPage = dynamic(loadSearchPage, {
  loading: () => <BrowseLoading />,
});
const LivePage = dynamic(loadLivePage, {
  loading: () => <BrowseLoading />,
});

/** Initial documents retain server routing/auth; menu transitions reuse this mounted client workspace. */
export default function BrowseWorkspace() {
  const pathname = usePathname();
  const view =
    pathname === '/douban' ? (
      <CatalogPage />
    ) : pathname === '/search' ? (
      <SearchPage />
    ) : pathname === '/live' ? (
      <LivePage />
    ) : (
      <HomePage />
    );
  return (
    <BrowseNavigationContext.Provider value={true}>
      <BrowsePageBoundary key={pathname} fallback={<BrowseLoading failed />}>
        {view}
      </BrowsePageBoundary>
    </BrowseNavigationContext.Provider>
  );
}
