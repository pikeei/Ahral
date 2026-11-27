import { option, question } from '../../core/exam/test-helpers'
import type { NodeDatabase } from './connection'
import { openDatabase } from './connection'
import { type DocumentContent, type DocumentMeta, insertDocument } from './documents'
import { migrate } from './migrations'

export function memoryDb(): NodeDatabase {
  const db = openDatabase(':memory:')
  migrate(db)
  return db
}

export function meta(sha256 = 'a'.repeat(64), opts: Partial<DocumentMeta> = {}): DocumentMeta {
  return { sha256, fileName: 'notes.pdf', sourcePath: 'D:/study/notes.pdf', pipelineVersion: 1, ...opts }
}

/** Two chapters, a subsection, a glossary and one question of each kind. */
export function content(opts: Partial<DocumentContent> = {}): DocumentContent {
  return {
    pageCount: 12,
    warnings: ['Some pages have no text.'],
    sections: [
      { id: 1, title: 'Radiation Protection', level: 1, parentId: null, pageStart: 1, pageEnd: 6 },
      { id: 2, title: 'Shielding', level: 2, parentId: 1, pageStart: 3, pageEnd: 6 },
      { id: 3, title: null, level: 1, parentId: null, pageStart: 7, pageEnd: 12 }
    ],
    glossary: [
      { term: 'Erythema', definition: 'Erythema is the reddening of skin.', page: 4 },
      { term: 'Attenuation', definition: 'Attenuation is the reduction of beam intensity.', page: 9 }
    ],
    questions: [
      question('q1', { sectionId: 1, acceptedAnswers: ['erythema', 'skin reddening'] }),
      question('q2', {
        type: 'mcq-term',
        sectionId: 2,
        answer: 'Erythema',
        options: [option('Erythema'), option('Attenuation', 'Attenuation', 9), { text: 'No source' }],
        quality: 0.875
      }),
      question('q3', { type: 'mcq-definition', sectionId: 3 })
    ],
    ...opts
  }
}

export function insertSample(db: NodeDatabase, sha256?: string): number {
  return insertDocument(db, meta(sha256), content())
}
