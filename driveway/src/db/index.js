import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

let db;

/** Opens the database (creating it if needed) and applies the schema. */
export function openDb(file = config.dbFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  return conn;
}

export function getDb() {
  if (!db) db = openDb();
  return db;
}

/** Used by tests to run against a throwaway in-memory database. */
export function setDb(conn) {
  db = conn;
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

export const now = () => Date.now();

/** Runs fn inside a transaction; better-sqlite3 transactions are synchronous. */
export function tx(fn) {
  return getDb().transaction(fn)();
}
