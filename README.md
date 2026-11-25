# Ahral

An offline Windows desktop app that turns PDF reading material into practice exams
using rule-based text analysis. No generative AI, no cloud, no paid services.

> Status: Stage 4 (exam engine: assembly, grading with explanations, scoring). Command line only; no exam UI yet.

## Stack

Electron · React · TypeScript · Tailwind CSS · SQLite (Node's built-in `node:sqlite`) ·
Vitest · Playwright · Biome · electron-builder

## Project layout

```
src/
  main/        Electron main process: database, file system, IPC handlers
  preload/     Typed bridge that exposes `window.api` to the UI
  renderer/    React UI (no Node access)
  shared/      Types shared by main and renderer (the IPC contract)
  core/        Pure TypeScript logic, no Electron or DOM:
    pdf/         PDF.js adapter and layout analysis (lines, columns, headers, blocks, sections)
    text/        Normalization, sentence splitting, answer comparison, missing-letter repair
    analysis/    Definitions, acronyms, key terms (TF-IDF)
    generation/  Sentence filter, fill-in-the-blank and multiple-choice questions, dedupe
    exam/        Seeded exam assembly, grading with explanations, scoring and weak sections
tests/
  integration/ Golden-file test of the whole pipeline (see below)
  e2e/         Playwright tests that launch the real desktop app
  fixtures/    Builders for test PDFs (generated, never committed as binaries)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run lint` | Lint and format check (Biome) |
| `npm run lint:fix` | Apply safe lint fixes and formatting |
| `npm run typecheck` | Type-check main/preload and renderer separately |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:coverage` | Tests with a coverage report and minimum thresholds |
| `npm run test:e2e` | Build, then launch the app and run Playwright tests |
| `npm run dist` | Build a Windows installer into `dist/` |
| `npm run extract -- <file.pdf> [--all] [--json]` | Print the sections and sentences extracted from a PDF |
| `npm run analyze -- <file.pdf> [--top N] [--json]` | Print the definitions, acronyms and ranked key terms found in a PDF |
| `npm run generate -- <file.pdf> [--all] [--json]` | Generate questions from a PDF and print a sample of each type |
| `npm run exam -- <file.pdf> [--count N] [--seed N] [--types ...] [--typos] [--auto]` | Take a practice exam in the terminal, with feedback after each answer |
| `npm run sample-pdf` | Generate `samples/demo-reviewer.pdf` to try extraction on |

`samples/` is git-ignored: put your own study PDFs there to test extraction locally.

## Quality checks

CI runs on every push and pull request (Windows): Biome lint and format check, type check,
unit and integration tests with coverage thresholds, and Playwright E2E tests on the built app.

**Golden-file test.** `tests/integration/golden.test.ts` builds a PDF that reproduces the problems
found in real books (missing letters, two columns, running headers, Q&A layout), runs the full
pipeline, and compares the result with `tests/integration/__golden__/pipeline.txt`. A change in
extraction or question quality therefore shows up as a readable diff. After an intentional change,
review the diff and update the file with `npx vitest run -u`.

## Requirements

Node.js 24+ on Windows. No Rust, Python or C++ build tools needed.
