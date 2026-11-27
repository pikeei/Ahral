import { analyzeDocument } from '../core/analysis/analyze'
import { describeQuestionBank, extractQuestionBank } from '../core/bank/question-bank'
import { buildGlossary } from '../core/exam/grade'
import { type ExtractOptions, extractDocument } from '../core/extract'
import { generateQuestions } from '../core/generation/generate'
import type { DocumentContent } from './db/documents'

/** The steps of an import, reported so the UI can show what is happening during a long book. */
export type PipelineStage = 'reading' | 'analyzing' | 'generating'

export interface PipelineOptions extends ExtractOptions {
  onStage?: (stage: PipelineStage) => void
}

/** PDF bytes -> everything stored for a document. Pure computation: no database, no Electron. */
export async function runPipeline(data: Uint8Array, options: PipelineOptions = {}): Promise<DocumentContent> {
  const { onStage, ...extractOptions } = options
  onStage?.('reading')
  const doc = await extractDocument(data, extractOptions)
  onStage?.('analyzing')
  const analysis = analyzeDocument(doc)
  onStage?.('generating')
  const generated = generateQuestions(doc, analysis, options.isWord ? { isWord: options.isWord } : {})
  // Questions the document already has (a review book's question bank) come first.
  const bank = extractQuestionBank(doc.blocks)
  const bankNote = describeQuestionBank(bank.stats)
  return {
    pageCount: doc.pageCount,
    warnings: bankNote ? [...doc.warnings, bankNote] : doc.warnings,
    sections: doc.sections,
    glossary: buildGlossary(analysis.definitions),
    questions: [...bank.questions, ...generated.questions]
  }
}
