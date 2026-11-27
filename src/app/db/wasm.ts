import type { BindableValue, Database } from '@sqlite.org/sqlite-wasm'
import type { SqlDatabase, SqlValue } from './sql'

/*
 * SqlDatabase on top of SQLite compiled to WebAssembly (the website's database).
 *
 * The WASM build's object API (oo1) prepares, binds and steps statements by hand; these
 * helpers give it the same prepare(...).run/get/all shape as node:sqlite, so the database
 * code is shared unchanged. Statements are prepared per call: SQLite prepares a statement
 * in microseconds, and nothing has to be finalized later.
 */
export function wrapWasmDatabase(db: Database): SqlDatabase {
  // The WASM build rejects an empty parameter list for a statement without parameters.
  const bind = (params: SqlValue[]) => (params.length > 0 ? (params as BindableValue[]) : undefined)
  return {
    exec: (sql) => {
      db.exec(sql)
    },
    prepare: (sql) => ({
      run: (...params) => {
        const values = bind(params)
        db.exec(values ? { sql, bind: values } : { sql })
        return {
          changes: db.changes(),
          lastInsertRowid: Number(db.selectValue('SELECT last_insert_rowid()') ?? 0)
        }
      },
      get: (...params) => db.selectObject(sql, bind(params)),
      all: (...params) => db.selectObjects(sql, bind(params))
    })
  }
}
