'use client';

import Link, { useLinkStatus } from 'next/link';
import { ComponentProps, useContext } from 'react';

import { preloadBrowseRoute } from '@/lib/browse-preload';
import { navigateCategoryLocally } from '@/lib/category-navigation';

import { BrowseNavigationContext } from './BrowseNavigationContext';

function PendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role='status'
      aria-label='正在打开分类'
      className='h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent'
    />
  );
}

export default function CategoryLink({
  children,
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & {
  href: string;
}) {
  const workspaceMounted = useContext(BrowseNavigationContext);
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => {
        props.onPointerEnter?.(event);
        preloadBrowseRoute(href);
      }}
      onFocus={(event) => {
        props.onFocus?.(event);
        preloadBrowseRoute(href);
      }}
      onNavigate={(event) => {
        if (workspaceMounted && navigateCategoryLocally(href)) {
          event.preventDefault();
          window.scrollTo(0, 0);
        }
      }}
    >
      {children}
      <PendingIndicator />
    </Link>
  );
}
