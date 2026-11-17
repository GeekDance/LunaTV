// Public catalog metadata only; credentials, favorites and viewing records never enter this cache.
const STORAGE_KEY = 'lunatv:catalog:v1';
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 24;
const MAX_BYTES = 500_000;
type Entry = { savedAt: number; data: unknown };
const memory = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

function readSession(): Record<string, Entry> {
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function fresh(entry: Entry | undefined): entry is Entry {
  const age = Date.now() - (entry?.savedAt ?? 0);
  return !!entry && age >= 0 && age < TTL_MS;
}

function save(key: string, data: unknown) {
  const entry = { savedAt: Date.now(), data };
  memory.delete(key);
  memory.set(key, entry);
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  try {
    const entries = Object.entries({ ...readSession(), [key]: entry })
      .filter(([, value]) => fresh(value))
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_ENTRIES);
    let serialized = JSON.stringify(Object.fromEntries(entries));
    while (serialized.length > MAX_BYTES && entries.length) {
      entries.pop();
      serialized = JSON.stringify(Object.fromEntries(entries));
    }
    sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    /* Storage may be disabled or full; the bounded memory cache still works. */
  }
}

export function cachedCatalog<T>(
  key: string,
  load: () => Promise<T>,
  cacheable: (data: T) => boolean
): Promise<T> {
  if (typeof window === 'undefined') return load();
  const entry = memory.get(key) || readSession()[key];
  if (fresh(entry) && cacheable(entry.data as T))
    return Promise.resolve(entry.data as T);
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const request = load()
    .then((data) => {
      if (cacheable(data)) save(key, data);
      return data;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
