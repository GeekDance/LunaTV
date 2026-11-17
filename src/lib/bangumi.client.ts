'use client';

import { cachedCatalog } from './catalog-cache';

export interface BangumiCalendarData {
  weekday: {
    en: string;
  };
  items: {
    id: number;
    name: string;
    name_cn: string;
    rating: {
      score: number;
    };
    air_date: string;
    images: {
      large: string;
      common: string;
      medium: string;
      small: string;
      grid: string;
    };
  }[];
}

async function fetchBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  const response = await fetch('/api/bangumi/calendar');
  if (!response.ok) {
    throw new Error(`获取番剧日历失败: HTTP ${response.status}`);
  }
  const data = await response.json();
  const filteredData = data.map((item: BangumiCalendarData) => ({
    ...item,
    items: item.items.filter(bangumiItem => bangumiItem.images)
  }));

  return filteredData;
}

export function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  return cachedCatalog('bangumi:calendar', fetchBangumiCalendarData, data => Array.isArray(data) && data.every(day =>
    typeof day?.weekday?.en === 'string' && Array.isArray(day.items) &&
    day.items.every(item => !!item && typeof item.id === 'number' &&
      (typeof item.name === 'string' || typeof item.name_cn === 'string') &&
      !!item.images && Object.values(item.images).some(url => typeof url === 'string' && !!url)
    )
  ));
}
