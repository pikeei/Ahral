import { afterEach, describe, expect, it } from 'vitest'
import type { NodeDatabase } from './connection'
import { openDatabase } from './connection'
import { MIGRATIONS, migrate, SCHEMA_VERSION, schemaVersion } from './migrations'

describe('migrate', () => {
  let db: NodeDatabase | undefined
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
    expect((tables as { name: string }[]).map((t) => t.name)).toEqual([
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
        .map((c) => (c as { name: string }).name)
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

  it('upgrades a version 2 database without losing exams or attempts (v3: board review)', () => {
    const d = open()
    migrate(d, MIGRATIONS.slice(0, 2))
    d.exec(`
      INSERT INTO documents (id, sha256, file_name, page_count, pipeline_version, warnings, imported_at, updated_at)
        VALUES (1, 'abc', 'old.pdf', 3, 1, '[]', '2026-01-01', '2026-01-01');
      INSERT INTO exams (id, document_id, seed, config, warnings, created_at)
        VALUES (7, 1, 42, '{"questionCount":1}', '[]', '2026-01-02');
      INSERT INTO exam_items (exam_id, position, question, option_order) VALUES (7, 0, '{}', NULL);
      INSERT INTO attempts (id, exam_id, accept_typos, correct, total, started_at, finished_at)
        VALUES (3, 7, 0, 1, 1, '2026-01-02', '2026-01-02');
      INSERT INTO attempt_answers (attempt_id, position, question_id, section_label, given, status, correct)
        VALUES (3, 0, 'q1', 'Chapter 1', 'x', 'correct', 1);
    `)
    migrate(d)

    // Rebuilding the exams table must not take its items and attempts with it.
    const count = (table: string) => (d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
    expect([count('exams'), count('exam_items'), count('attempts'), count('attempt_answers')]).toEqual([1, 1, 1, 1])
    expect(d.prepare('SELECT mode, document_id FROM exams').get()).toEqual({ mode: 'practice', document_id: 1 })
    // A study-set exam belongs to no document; foreign keys are enforced again afterwards.
    d.exec(
      `INSERT INTO exams (document_id, mode, seed, config, warnings, created_at) VALUES (NULL, 'mock', 1, '{}', '[]', '')`
    )
    expect(d.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(() => d.exec(`INSERT INTO exam_items (exam_id, position, question) VALUES (999, 0, '{}')`)).toThrow(
      /FOREIGN KEY/
    )
    // And deleting the document still removes its exams, items and attempts.
    d.exec('DELETE FROM documents')
    expect([count('exam_items'), count('attempts'), count('attempt_answers')]).toEqual([0, 0, 0])
  })

  it('upgrades a version 1 database without losing its questions (v2: book questions)', () => {
    const d = open()
    migrate(d, MIGRATIONS.slice(0, 1))
    d.exec(`
      INSERT INTO documents (id, sha256, file_name, page_count, pipeline_version, warnings, imported_at, updated_at)
        VALUES (1, 'abc', 'old.pdf', 3, 1, '[]', '2026-01-01', '2026-01-01');
      INSERT INTO questions (document_id, id, position, type, prompt, answer, accepted_answers, options,
          explanation, page, section_id, sentence_id, term_key, quality)
        VALUES (1, 'q1', 0, 'cloze', 'The _____ is red.', 'apple', '[]', NULL, 'The apple is red.', 2, 1, 5, 'apple', 0.5);
    `)
    migrate(d)

    expect(schemaVersion(d)).toBe(SCHEMA_VERSION)
    const rows = d.prepare('SELECT id, type, answer, keep_option_order, explanation_page FROM questions').all()
    expect(rows).toEqual([{ id: 'q1', type: 'cloze', answer: 'apple', keep_option_order: 0, explanation_page: null }])
    // The rebuilt table still belongs to its document: deleting the document removes it.
    d.exec('DELETE FROM documents')
    expect(d.prepare('SELECT COUNT(*) AS n FROM questions').get()).toEqual({ n: 0 })
  })
})
