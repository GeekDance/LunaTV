import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';

export default function Loading() {
  return (
    <PageLayout activePath='/douban'>
      <div className='px-4 py-4 sm:px-10 sm:py-8' aria-busy='true'>
        <p role='status' className='mb-6 text-gray-500'>
          正在打开分类…
        </p>
        <div className='grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5'>
          {Array.from({ length: 15 }, (_, index) => (
            <DoubanCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
