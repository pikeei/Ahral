import { afterEach, describe, expect, it } from 'vitest'
import type { NodeDatabase } from './connection'
import { openDatabase } from './connection'
import { getSqliteVersion, transaction } from './sql'

describe('openDatabase', () => {
  let db: NodeDatabase | undefined

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

describe('transaction', () => {
  const setup = () => {
    const db = openDatabase(':memory:')
    db.exec('CREATE TABLE t (x INTEGER)')
    return db
  }
  const count = (db: NodeDatabase) => (db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n

  it('commits and returns the result', () => {
    const db = setup()
    const result = transaction(db, () => {
      db.prepare('INSERT INTO t VALUES (1)').run()
      db.prepare('INSERT INTO t VALUES (2)').run()
      return 'done'
    })
    expect(result).toBe('done')
    expect(count(db)).toBe(2)
    db.close()
  })

  it('rolls back every write when one step fails', () => {
    const db = setup()
    expect(() =>
      transaction(db, () => {
        db.prepare('INSERT INTO t VALUES (1)').run()
        throw new Error('disk full')
      })
    ).toThrow('disk full')
    expect(count(db)).toBe(0)
    db.close()
  })
})
