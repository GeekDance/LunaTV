'use client';

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
    } | null;
  }[];
}

export async function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/bangumi/calendar', {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`获取番剧日历失败: HTTP ${response.status}`);
    }
    const data: BangumiCalendarData[] = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('番剧日历数据格式错误');
    }
    return data.map((day) => ({
      ...day,
      items: day.items.filter((item) => item.images != null),
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}
