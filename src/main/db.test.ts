import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { getSqliteVersion, openDatabase } from './db'

describe('openDatabase', () => {
  let db: DatabaseSync | undefined

  afterEach(() => {
    db?.close()
    db = undefined
  })

  it('opens an in-memory database and reports the SQLite version', () => {
    db = openDatabase(':memory:')
    expect(getSqliteVersion(db)).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('enforces foreign keys', () => {
    db = openDatabase(':memory:')
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
    `)
    const insertOrphan = () => db!.prepare('INSERT INTO child (parent_id) VALUES (?)').run(999)
    expect(insertOrphan).toThrow(/FOREIGN KEY/)
  })
})
