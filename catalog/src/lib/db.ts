import Database from 'better-sqlite3';
import path from 'node:path';

/**
 * Одна таблица на всё: и квартиры, и товары. Для личного каталога
 * на несколько сотен позиций этого достаточно, а схема помещается на экран.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL DEFAULT 'product',
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  category    TEXT    NOT NULL DEFAULT '',
  district    TEXT    NOT NULL DEFAULT '',
  rooms       TEXT    NOT NULL DEFAULT '',
  area        INTEGER,
  floor       TEXT    NOT NULL DEFAULT '',
  furnished   INTEGER NOT NULL DEFAULT 0,
  images      TEXT    NOT NULL DEFAULT '[]',
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS items_kind_idx ON items (hidden, kind, created_at DESC);
`;

const globalForDb = globalThis as unknown as { db?: Database.Database };

function open(): Database.Database {
  const database = new Database(path.join(process.cwd(), 'data.db'));
  database.pragma('journal_mode = WAL');
  database.exec(SCHEMA);
  return database;
}

export const db = globalForDb.db ?? open();
if (process.env.NODE_ENV !== 'production') globalForDb.db = db;

export interface Item {
  id: number;
  kind: 'product' | 'realty';
  title: string;
  description: string;
  price: number;
  category: string;
  district: string;
  rooms: string;
  area: number | null;
  floor: string;
  furnished: number;
  images: string;
  hidden: number;
  created_at: string;
}

export function images(item: Item): string[] {
  try {
    return JSON.parse(item.images) as string[];
  } catch {
    return [];
  }
}

export const priceText = (value: number) => `${value.toLocaleString('ru-RU')} TL`;

export function listItems(options: { kind?: string; q?: string; includeHidden?: boolean } = {}): Item[] {
  const where: string[] = [];
  const params: Record<string, string> = {};

  if (!options.includeHidden) where.push('hidden = 0');
  if (options.kind) {
    where.push('kind = @kind');
    params.kind = options.kind;
  }
  if (options.q) {
    where.push('(title LIKE @q OR description LIKE @q OR category LIKE @q OR district LIKE @q)');
    params.q = `%${options.q}%`;
  }

  const sql = `SELECT * FROM items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
  return db.prepare(sql).all(params) as Item[];
}

export function getItem(id: number): Item | undefined {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
}
