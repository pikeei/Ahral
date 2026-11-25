import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './connection'

/*
 * Schema migrations. Each entry upgrades the database by one version; the current
 * version lives in SQLite's built-in `user_version` header field, so no extra table is needed.
 *
 * Never edit a migration that has shipped: add a new one instead. A user's database
 * may be at any earlier version, and every step must still apply in order.
 *
 * STRICT tables make SQLite reject a value of the wrong type instead of storing it anyway.
 */
const MIGRATIONS: readonly string[] = [
  // 1: documents with their sections, glossary and questions; exams and attempts.
  `
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    source_path TEXT,
    page_count INTEGER NOT NULL,
    pipeline_version INTEGER NOT NULL,
    warnings TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE sections (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    title TEXT,
    level INTEGER NOT NULL,
    parent_id INTEGER,
    page_start INTEGER NOT NULL,
    page_end INTEGER NOT NULL,
    PRIMARY KEY (document_id, id)
  ) STRICT;

  CREATE TABLE glossary (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    page INTEGER NOT NULL,
    PRIMARY KEY (document_id, position)
  ) STRICT;

  CREATE TABLE questions (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cloze', 'mcq-term', 'mcq-definition')),
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    accepted_answers TEXT NOT NULL,
    options TEXT,
    explanation TEXT NOT NULL,
    page INTEGER NOT NULL,
    section_id INTEGER NOT NULL,
    sentence_id INTEGER NOT NULL,
    term_key TEXT NOT NULL,
    quality REAL NOT NULL,
    PRIMARY KEY (document_id, id)
  ) STRICT;

  -- An exam keeps a copy of each question as it was shown, so it can be reviewed
  -- (and its attempts make sense) even after the document's questions are regenerated.
  CREATE TABLE exams (
    id INTEGER PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    seed INTEGER NOT NULL,
    config TEXT NOT NULL,
    warnings TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX exams_by_document ON exams(document_id);

  CREATE TABLE exam_items (
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    question TEXT NOT NULL,
    option_order TEXT,
    PRIMARY KEY (exam_id, position)
  ) STRICT;

  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    accept_typos INTEGER NOT NULL CHECK (accept_typos IN (0, 1)),
    correct INTEGER NOT NULL,
    total INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX attempts_by_exam ON attempts(exam_id);

  -- The section label is copied too: section ids can change when a document is regenerated.
  CREATE TABLE attempt_answers (
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    section_label TEXT NOT NULL,
    given TEXT,
    status TEXT NOT NULL CHECK (status IN ('correct', 'almost', 'wrong', 'unanswered')),
    correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
    PRIMARY KEY (attempt_id, position)
  ) STRICT;
  `
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

/** Brings the database up to SCHEMA_VERSION. Each step commits on its own, so a failure leaves a valid version. */
export function migrate(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): void {
  const current = schemaVersion(db)
  if (current > migrations.length) {
    throw new Error(
      `This database was created by a newer version of Ahral (schema ${current}; this version knows up to ${migrations.length}).`
    )
  }
  for (let version = current + 1; version <= migrations.length; version++) {
    transaction(db, () => {
      db.exec(migrations[version - 1] ?? '')
      db.exec(`PRAGMA user_version = ${version}`)
    })
  }
}
