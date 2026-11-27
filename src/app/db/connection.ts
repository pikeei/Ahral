import { DatabaseSync } from 'node:sqlite'
import type { SqlDatabase } from './sql'

/**
 * Opens (or creates) the database file with Node's built-in `node:sqlite`, which ships
 * inside Electron: no native npm module to compile. Used by the desktop app, tests and CLIs;
 * the website opens SQLite compiled to WebAssembly instead (src/web/wasm-database.ts).
 */
/** A database opened from a file (or :memory:), which can be closed. */
export type NodeDatabase = SqlDatabase & { close(): void }

export function openDatabase(path: string): NodeDatabase {
  const db = new DatabaseSync(path)
  // WAL: readers don't block the writer, and a crash can't corrupt the file mid-write.
  db.exec('PRAGMA journal_mode = WAL;')
  // SQLite ignores foreign keys unless this is switched on, per connection.
  db.exec('PRAGMA foreign_keys = ON;')
  return db
}
