/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getLiveChannelsForSource } from '@/lib/live';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const config = await getConfig({ fresh: true });

    if (!config) {
      return NextResponse.json({ error: '配置未找到' }, { status: 404 });
    }

    // 过滤出所有非 disabled 的直播源
    const liveSources = (config.LiveConfig || []).filter(source => !source.disabled);

    if (request.nextUrl.searchParams.get('includeChannels') === '1') {
      const requestedSource = request.nextUrl.searchParams.get('source');
      const initialSource = liveSources.find(source => source.key === requestedSource) || liveSources[0];
      let channels = null;
      if (initialSource) {
        try {
          channels = (await getLiveChannelsForSource(initialSource))?.channels || [];
        } catch {
          // Keep source selection available if one playlist is unavailable.
        }
      }
      return NextResponse.json({ success: true, data: liveSources,
        channelSourceKey: initialSource?.key || null, channels },
        { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ success: true, data: liveSources });
  } catch (error) {
    console.error('获取直播源失败:', error);
    return NextResponse.json(
      { error: '获取直播源失败' },
      { status: 500 }
    );
  }
}
