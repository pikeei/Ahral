import { DatabaseSync } from 'node:sqlite'

/**
 * Opens (or creates) the local SQLite database.
 *
 * Uses Node's built-in `node:sqlite` module, which ships inside Electron.
 * That means no native npm module to compile or rebuild per Electron version.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  // WAL: readers don't block the writer, and a crash can't corrupt the file mid-write.
  db.exec('PRAGMA journal_mode = WAL;')
  // SQLite ignores foreign keys unless this is switched on, per connection.
  db.exec('PRAGMA foreign_keys = ON;')
  return db
}

export function getSqliteVersion(db: DatabaseSync): string {
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string }
  return row.version
}

/**
 * Runs `work` in one transaction: either every write lands or none does.
 * node:sqlite has no transaction helper, so this is the usual BEGIN / COMMIT / ROLLBACK.
 */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
