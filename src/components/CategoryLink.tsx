'use client';

import Link, { useLinkStatus } from 'next/link';
import { ComponentProps } from 'react';

import { navigateCategoryLocally } from '@/lib/category-navigation';

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
  return (
    <Link
      {...props}
      href={href}
      prefetch
      onNavigate={(event) => {
        if (navigateCategoryLocally(href)) {
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
