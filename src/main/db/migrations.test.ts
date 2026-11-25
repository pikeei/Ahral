import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { migrate, SCHEMA_VERSION, schemaVersion } from './migrations'

describe('migrate', () => {
  let db: DatabaseSync | undefined
  const open = () => {
    db = openDatabase(':memory:')
    return db
  }

  afterEach(() => {
    db?.close()
    db = undefined
  })

  it('brings a new database to the latest version', () => {
    const d = open()
    expect(schemaVersion(d)).toBe(0)
    migrate(d)
    expect(schemaVersion(d)).toBe(SCHEMA_VERSION)
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    expect(tables.map((t) => t.name)).toEqual([
      'attempt_answers',
      'attempts',
      'documents',
      'exam_items',
      'exams',
      'glossary',
      'questions',
      'sections'
    ])
  })

  it('is safe to run on every start', () => {
    const d = open()
    migrate(d)
    expect(() => migrate(d)).not.toThrow()
    expect(schemaVersion(d)).toBe(SCHEMA_VERSION)
  })

  it('applies only the steps a database is missing', () => {
    const d = open()
    migrate(d, ['CREATE TABLE a (x INTEGER) STRICT;'])
    migrate(d, ['CREATE TABLE a (x INTEGER) STRICT;', 'ALTER TABLE a ADD COLUMN y TEXT;'])
    expect(schemaVersion(d)).toBe(2)
    expect(
      d
        .prepare('PRAGMA table_info(a)')
        .all()
        .map((c) => c.name)
    ).toEqual(['x', 'y'])
  })

  it('keeps the last good version when a step fails', () => {
    const d = open()
    const steps = ['CREATE TABLE a (x INTEGER) STRICT;', 'CREATE TABLE b (x INTEGER); NOT VALID SQL;']
    expect(() => migrate(d, steps)).toThrow()
    expect(schemaVersion(d)).toBe(1)
    // The failed step rolled back completely: table b was not left behind.
    expect(d.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
  })

  it('refuses a database from a newer version of the app', () => {
    const d = open()
    d.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`)
    expect(() => migrate(d)).toThrow(/newer version of Ahral/)
  })

  it('creates STRICT tables that reject values of the wrong type', () => {
    const d = open()
    migrate(d)
    const insert = () =>
      d
        .prepare(
          `INSERT INTO documents (sha256, file_name, page_count, pipeline_version, warnings, imported_at, updated_at)
           VALUES ('x', 'a.pdf', 'many', 1, '[]', '', '')`
        )
        .run()
    expect(insert).toThrow(/cannot store TEXT value in INTEGER column/)
  })
})
