import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { SearchRequestError, searchSourcePage } from '@/lib/search-page.server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await searchSourcePage(
      getAuthInfoFromCookie(request)?.username,
      params.get('q') || '',
      params.get('source') || '',
      Number(params.get('page'))
    );
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SearchRequestError
            ? error.message
            : '搜索暂时不可用',
      },
      {
        status: error instanceof SearchRequestError ? error.status : 500,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
