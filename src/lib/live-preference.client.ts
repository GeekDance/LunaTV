import { getAuthInfoFromBrowserCookie } from './auth';

interface ChannelIdentity {
  id: string;
  name: string;
  tvgId?: string;
}
interface LastLiveChannel extends ChannelIdentity {
  sourceKey: string;
}

function storageKey() {
  const username = getAuthInfoFromBrowserCookie()?.username;
  return `lunatv:last-live:${username ? `user:${encodeURIComponent(username)}` : 'guest'}:v1`;
}

export function readLastLiveChannel(): LastLiveChannel | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    if (!value || !['sourceKey', 'id', 'name'].every(key => typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 256)) return null;
    if (value.tvgId !== undefined && (typeof value.tvgId !== 'string' || value.tvgId.length > 256)) return null;
    return { sourceKey: value.sourceKey, id: value.id, name: value.name, tvgId: value.tvgId };
  } catch {
    return null;
  }
}

export function rememberLiveChannel(sourceKey: string, channel: ChannelIdentity) {
  try {
    // Save identity only. Signed stream addresses and credentials never belong here.
    localStorage.setItem(storageKey(), JSON.stringify({ sourceKey, id: channel.id, name: channel.name, tvgId: channel.tvgId }));
  } catch {
    // Playback remains usable when browser storage is unavailable.
  }
}

export function findRememberedLiveChannel<T extends ChannelIdentity>(sourceKey: string, channels: T[]): T | undefined {
  const saved = readLastLiveChannel();
  if (!saved || saved.sourceKey !== sourceKey) return undefined;
  // Playlist IDs are positional. Check the name too so reordering cannot select another station.
  return channels.find(channel => channel.id === saved.id && channel.name === saved.name && channel.tvgId === saved.tvgId)
    || channels.find(channel => channel.name === saved.name && channel.tvgId === saved.tvgId);
}
