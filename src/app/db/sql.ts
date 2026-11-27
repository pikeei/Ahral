/*
 * The small part of SQLite the app uses, so the same database code runs on Node's built-in
 * `node:sqlite` (desktop app, tests, CLIs) and on SQLite compiled to WebAssembly (the website).
 * Results are `unknown`: each query casts its rows to the shape it selected.
 */

export type SqlValue = string | number | bigint | null | Uint8Array

export interface SqlStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  get(...params: SqlValue[]): unknown
  all(...params: SqlValue[]): unknown[]
}

export interface SqlDatabase {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
}

/**
 * Runs `work` in one transaction: either every write lands or none does.
 * Neither SQLite binding has a helper for this, so it is the usual BEGIN / COMMIT / ROLLBACK.
 */
export function transaction<T>(db: SqlDatabase, work: () => T): T {
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

export function getSqliteVersion(db: SqlDatabase): string {
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string }
  return row.version
}
