import type { AdminConfig } from './admin.types';
import type { Favorite, IStorage, PlayRecord, SkipConfig } from './types';

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface TrialDatabase {
  prepare(sql: string): Statement;
}

// Every operation resolves the binding in its current request context.
export class D1Storage implements IStorage {
  constructor(
    private readonly getDatabase: () => TrialDatabase | Promise<TrialDatabase>
  ) {}

  private prefix(user: string, group: string) {
    return `user/${encodeURIComponent(user)}/${group}/`;
  }
  private async read<T>(key: string): Promise<T | null> {
    const db = await this.getDatabase();
    const row = await db
      .prepare('SELECT value FROM lunatv_storage WHERE key = ?')
      .bind(key)
      .first<{ value: string }>();
    return row ? (JSON.parse(row.value) as T) : null;
  }
  private async write(key: string, value: unknown) {
    const db = await this.getDatabase();
    await db
      .prepare(
        'INSERT INTO lunatv_storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .bind(key, JSON.stringify(value))
      .run();
  }
  private async remove(key: string) {
    const db = await this.getDatabase();
    await db
      .prepare('DELETE FROM lunatv_storage WHERE key = ?')
      .bind(key)
      .run();
  }
  private async entries<T>(prefix: string): Promise<Record<string, T>> {
    const db = await this.getDatabase();
    const { results } = await db
      .prepare(
        'SELECT key, value FROM lunatv_storage WHERE key >= ? AND key < ? ORDER BY key'
      )
      .bind(prefix, prefix + '\uffff')
      .all<{ key: string; value: string }>();
    return Object.fromEntries(
      results.map((row) => [
        row.key.slice(prefix.length),
        JSON.parse(row.value) as T,
      ])
    );
  }
  private async removePrefix(prefix: string) {
    const db = await this.getDatabase();
    await db
      .prepare('DELETE FROM lunatv_storage WHERE key >= ? AND key < ?')
      .bind(prefix, prefix + '\uffff')
      .run();
  }

  getPlayRecord(user: string, key: string) {
    return this.read<PlayRecord>(this.prefix(user, 'records') + key);
  }
  setPlayRecord(user: string, key: string, record: PlayRecord) {
    return this.write(this.prefix(user, 'records') + key, record);
  }
  getAllPlayRecords(user: string) {
    return this.entries<PlayRecord>(this.prefix(user, 'records'));
  }
  deletePlayRecord(user: string, key: string) {
    return this.remove(this.prefix(user, 'records') + key);
  }
  deleteAllPlayRecords(user: string) {
    return this.removePrefix(this.prefix(user, 'records'));
  }

  getFavorite(user: string, key: string) {
    return this.read<Favorite>(this.prefix(user, 'favorites') + key);
  }
  setFavorite(user: string, key: string, favorite: Favorite) {
    return this.write(this.prefix(user, 'favorites') + key, favorite);
  }
  getAllFavorites(user: string) {
    return this.entries<Favorite>(this.prefix(user, 'favorites'));
  }
  deleteFavorite(user: string, key: string) {
    return this.remove(this.prefix(user, 'favorites') + key);
  }
  deleteAllFavorites(user: string) {
    return this.removePrefix(this.prefix(user, 'favorites'));
  }

  private hex(bytes: Uint8Array) {
    return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  }
  private async derive(password: string, salt: Uint8Array) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    );
    return this.hex(new Uint8Array(bits));
  }
  async registerUser(user: string, password: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await this.write(
      `accounts/${encodeURIComponent(user)}`,
      `pbkdf2:${this.hex(salt)}:${await this.derive(password, salt)}`
    );
  }
  async verifyUser(user: string, password: string) {
    const stored = await this.read<string>(
      `accounts/${encodeURIComponent(user)}`
    );
    if (!stored) return false;
    const [format, saltHex, expected] = stored.split(':');
    if (
      format !== 'pbkdf2' ||
      !/^[a-f0-9]{32}$/.test(saltHex) ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      return false;
    const parts = saltHex.match(/../g);
    if (!parts) return false;
    const salt = new Uint8Array(parts.map((n) => parseInt(n, 16)));
    const actual = await this.derive(password, salt);
    let difference = 0;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    return difference === 0;
  }
  async checkUserExist(user: string) {
    return (await this.read(`accounts/${encodeURIComponent(user)}`)) !== null;
  }
  changePassword(user: string, password: string) {
    return this.registerUser(user, password);
  }
  async deleteUser(user: string) {
    await this.remove(`accounts/${encodeURIComponent(user)}`);
    await this.removePrefix(`user/${encodeURIComponent(user)}/`);
  }
  async getAllUsers() {
    return Object.keys(await this.entries('accounts/')).map(decodeURIComponent);
  }

  async getSearchHistory(user: string) {
    return (
      (await this.read<string[]>(this.prefix(user, 'history') + 'recent')) || []
    );
  }
  async addSearchHistory(user: string, keyword: string) {
    const history = await this.getSearchHistory(user);
    await this.write(
      this.prefix(user, 'history') + 'recent',
      [keyword, ...history.filter((item) => item !== keyword)].slice(0, 20)
    );
  }
  async deleteSearchHistory(user: string, keyword?: string) {
    if (!keyword) return this.remove(this.prefix(user, 'history') + 'recent');
    await this.write(
      this.prefix(user, 'history') + 'recent',
      (await this.getSearchHistory(user)).filter((item) => item !== keyword)
    );
  }

  getAdminConfig() {
    return this.read<AdminConfig>('admin/config');
  }
  setAdminConfig(config: AdminConfig) {
    return this.write('admin/config', config);
  }
  getSkipConfig(user: string, source: string, id: string) {
    return this.read<SkipConfig>(this.prefix(user, 'skip') + source + '+' + id);
  }
  setSkipConfig(user: string, source: string, id: string, config: SkipConfig) {
    return this.write(this.prefix(user, 'skip') + source + '+' + id, config);
  }
  deleteSkipConfig(user: string, source: string, id: string) {
    return this.remove(this.prefix(user, 'skip') + source + '+' + id);
  }
  getAllSkipConfigs(user: string) {
    return this.entries<SkipConfig>(this.prefix(user, 'skip'));
  }
  async clearAllData() {
    const db = await this.getDatabase();
    await db.prepare('DELETE FROM lunatv_storage').run();
  }
}
