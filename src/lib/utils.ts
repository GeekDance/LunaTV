/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import he from 'he';
import Hls from 'hls.js';

import { matchesProbeResource, measureProbeNetwork, ProbeNetworkInfo } from './probe-measurement.client';

function getDoubanImageProxyConfig(): {
  proxyType:
  | 'server'
  | 'cmliussss-cdn-tencent'
  | 'cmliussss-cdn-ali'
  | 'custom';
  proxyUrl: string;
} {
  let doubanImageProxyType =
    localStorage.getItem('doubanImageProxyType') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE ||
    'cmliussss-cdn-tencent';
  // 兼容历史数据：直连和豆瓣官方精品 CDN 统一使用服务器代理
  if (doubanImageProxyType === 'direct' || doubanImageProxyType === 'img3') {
    doubanImageProxyType = 'server';
  }
  const doubanImageProxy =
    localStorage.getItem('doubanImageProxyUrl') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY ||
    '';
  return {
    proxyType: doubanImageProxyType,
    proxyUrl: doubanImageProxy,
  };
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  // 仅处理豆瓣图片代理
  if (!originalUrl.includes('doubanio.com')) {
    return originalUrl;
  }

  const { proxyType, proxyUrl } = getDoubanImageProxyConfig();
  switch (proxyType) {
    case 'server':
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    case 'cmliussss-cdn-tencent':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.net'
      );
    case 'cmliussss-cdn-ali':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.com'
      );
    case 'custom':
      return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
    default:
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  }
}

/**
 * 检查视频元数据与首个主媒体分片，只有可核验的非缓存样本才返回参考下载速度。
 * @param m3u8Url m3u8播放列表的URL
 * @returns 视频质量、测速状态、首片加载耗时及可用时的参考下载速度。
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string, signal?: AbortSignal): Promise<ProbeNetworkInfo & { quality: string }> {
  try {
    return await new Promise((resolve, reject) => {
      const abortError = () => Object.assign(new Error('Probe canceled'), { name: 'AbortError' });
      if (signal?.aborted) { reject(abortError()); return; }
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      const hls = new Hls();
      let released = false;
      let metadataLoaded = false;
      let measurement: ProbeNetworkInfo | undefined;
      let measuring = false;
      let measurementTimer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (released) return;
        released = true;
        clearTimeout(timeout);
        clearTimeout(measurementTimer);
        signal?.removeEventListener('abort', cancelProbe);
        video.onerror = null;
        video.onloadedmetadata = null;
        try { hls.destroy(); } catch { /* Already released. */ }
        video.remove();
      };
      const timeout = setTimeout(() => {
        cleanup(); reject(new Error('Timeout loading video metadata'));
      }, 4000);
      const cancelProbe = () => { cleanup(); reject(abortError()); };
      signal?.addEventListener('abort', cancelProbe, { once: true });
      if (signal?.aborted) { cancelProbe(); return; }
      const finish = () => {
        if (released || !metadataLoaded || !measurement) return;
        const width = video.videoWidth;
        const quality = !width ? '未知' : width >= 3840 ? '4K' : width >= 2560 ? '2K'
          : width >= 1920 ? '1080p' : width >= 1280 ? '720p' : width >= 854 ? '480p' : 'SD';
        cleanup(); resolve({ quality, ...measurement });
      };
      video.onerror = () => { cleanup(); reject(new Error('Failed to load video metadata')); };
      video.onloadedmetadata = () => { metadataLoaded = true; finish(); };
      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (!released && data.fatal) { cleanup(); reject(new Error(`HLS播放失败: ${data.type}`)); }
      });
      hls.on(Hls.Events.FRAG_LOADED, (_event: any, data: any) => {
        if (released || measuring || !data?.payload?.byteLength || data.frag?.sn === 'initSegment' ||
          (data.frag?.type && data.frag.type !== 'main')) return;
        measuring = true;
        // Wait one task for Resource Timing to publish the completed request.
        measurementTimer = setTimeout(() => {
          if (released) return;
          const stats = data.part?.stats || data.frag?.stats;
          const names = Array.from(new Set([data.frag?.url, data.networkDetails?.responseURL].filter((url): url is string => typeof url === 'string')));
          const entries = typeof performance.getEntriesByName === 'function' && stats
            ? names.flatMap(name => performance.getEntriesByName(name, 'resource') as PerformanceResourceTiming[])
              .filter(entry => matchesProbeResource(stats, entry)) : [];
          // Ambiguous parallel requests are not a trustworthy bandwidth sample.
          measurement = measureProbeNetwork(stats, entries.length === 1 ? entries[0] : undefined);
          finish();
        }, 0);
      });
      hls.loadSource(m3u8Url);
      hls.attachMedia(video);
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error(`Error getting video resolution: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';

  const cleanedText = text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .trim(); // 去掉首尾空格

  // 使用 he 库解码 HTML 实体
  return he.decode(cleanedText);
}
