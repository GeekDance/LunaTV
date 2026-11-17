import { getConfig } from './config';

// A client hint can only invalidate a stale cache. Headers always come from stored settings.
const checkedHints = new Map<string, { ua: string; checkedAt: number }>();

export async function getLiveSource(
  key: string | null,
  uaHint: string | null,
  playbackId: string | null = null
) {
  let source = (await getConfig()).LiveConfig?.find(
    (source) => source.key === key
  );
  if (uaHint === null) return source;
  const session = playbackId && playbackId.length <= 128 ? playbackId : null;
  const hintKey = JSON.stringify([key, uaHint, session]);
  const checked = checkedHints.get(hintKey);
  const currentUa = source?.ua || '';
  if (
    (!source || uaHint !== currentUa) &&
    !(
      session &&
      checked?.ua === currentUa &&
      Date.now() - checked.checkedAt < 5 * 60 * 1000
    )
  ) {
    source = (await getConfig({ fresh: true })).LiveConfig?.find(
      (source) => source.key === key
    );
    checkedHints.delete(hintKey);
    checkedHints.set(hintKey, { ua: source?.ua || '', checkedAt: Date.now() });
    while (checkedHints.size > 32) {
      const oldest = checkedHints.keys().next().value;
      if (oldest === undefined) break;
      checkedHints.delete(oldest);
    }
  }
  return source;
}
