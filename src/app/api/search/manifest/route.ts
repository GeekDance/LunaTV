import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getSearchManifest,
  SearchRequestError,
} from '@/lib/search-page.server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const manifest = await getSearchManifest(
      getAuthInfoFromCookie(request)?.username
    );
    return NextResponse.json(manifest, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SearchRequestError
            ? error.message
            : '搜索配置不可用',
      },
      {
        status: error instanceof SearchRequestError ? error.status : 500,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
