# Ahral

An offline Windows desktop app that turns PDF reading material into practice exams
using rule-based text analysis. No generative AI, no cloud, no paid services.

> Status: Stage 7 (Windows installer). Import PDFs, take exams with feedback, see results and history.

## Install

Download `Ahral-Setup-<version>.exe` from the repository's Releases page (or build it with
`npm run dist`) and run it. It installs for your Windows user only, so no administrator rights
are needed, and adds Start menu and desktop shortcuts.

The installer is not code-signed, so Windows SmartScreen may say it "protected your PC".
Choose **More info → Run anyway**. Signing needs a paid certificate, which this project doesn't use.

Your documents, exams and attempts are stored in `%APPDATA%\Ahral\ahral.db`. Uninstalling or
upgrading keeps them; delete that folder to remove them.

## Using the app

1. **Import PDF**: pick a PDF with selectable text. A long book takes about a minute, once;
   the work runs in a background thread so the window stays responsive.
2. **New exam**: choose the number of questions, the question types, optionally sections, and
   whether near-miss spellings count.
3. **Answer** each question: type the missing words, or pick an option (keys A–D or 1–4, Enter to
   check). Feedback explains the answer with the sentence and page it comes from, and for a wrong
   pick, what the option you chose actually describes.
4. **Results** show your score by type and section, the sections to review, and every answer.
   *Retake these questions* replays the same exam; the document page keeps your past attempts and
   your weak sections across all of them.

## Stack

Electron · React · TypeScript · Tailwind CSS · SQLite (Node's built-in `node:sqlite`) ·
Vitest · Playwright · Biome · electron-builder

## Project layout

```
src/
  main/        Electron main process: database (db/), PDF import (in a worker thread),
               exam service (grading happens here), IPC handlers with input checks
  preload/     Typed bridge that exposes `window.api` to the UI
  renderer/    React UI (no Node access): library, exam setup, exam, results
  shared/      Types shared by main and renderer (the IPC contract); answers never reach
               the UI before the user has answered
  core/        Pure TypeScript logic, no Electron or DOM:
    pdf/         PDF.js adapter and layout analysis (lines, columns, headers, blocks, sections)
    text/        Normalization, sentence splitting, answer comparison, missing-letter repair
    analysis/    Definitions, acronyms, key terms (TF-IDF)
    generation/  Sentence filter, fill-in-the-blank and multiple-choice questions, dedupe
    exam/        Seeded exam assembly, grading with explanations, scoring and weak sections
tests/
  integration/ Golden-file test of the whole pipeline (see below)
  e2e/         Playwright tests that launch the real desktop app and run the full study loop
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
| `npm run dist` | Build the Windows installer, `dist/Ahral-Setup-<version>.exe` |
| `npm run package` | Build the app unpacked into `dist/win-unpacked/` (no installer) |
| `npm run test:packaged` | Package the app, then run the E2E tests against the packaged `Ahral.exe` |
| `npm run installer` | Make the installer from an existing `dist/win-unpacked/` |
| `npm run icon` | Redraw the app icon, `build/icon.png` |
| `npm run extract -- <file.pdf> [--all] [--json]` | Print the sections and sentences extracted from a PDF |
| `npm run analyze -- <file.pdf> [--top N] [--json]` | Print the definitions, acronyms and ranked key terms found in a PDF |
| `npm run generate -- <file.pdf> [--all] [--json]` | Generate questions from a PDF and print a sample of each type |
| `npm run exam -- <file.pdf> [--count N] [--seed N] [--types ...] [--typos] [--auto] [--regenerate] [--db FILE]` | Take a practice exam in the terminal, with feedback after each answer. The PDF is imported into `data/ahral.db` on first use, and every attempt is saved |
| `npm run sample-pdf` | Generate `samples/demo-reviewer.pdf` to try extraction on |

`samples/` and `data/` are git-ignored: put your own study PDFs in `samples/` to test extraction locally.

## Database

Everything is stored locally in SQLite (`ahral.db` in the app's data folder; `data/ahral.db` for the CLIs).

- **Documents** are identified by the SHA-256 of the file, so the slow pipeline runs once per PDF.
  Importing the same file again (even renamed) loads the stored questions. When `PIPELINE_VERSION`
  (`src/core/version.ts`) is raised, documents are regenerated on their next import.
- **Exams** keep a copy of each question as shown, with the option order, so past exams can be
  reviewed even after their document is regenerated.
- **Attempts** store each answer with its status and section, which gives per-section history and
  weak sections across all attempts.
- **Migrations** (`src/main/db/migrations.ts`) run at start-up; the schema version is SQLite's
  `user_version`. Shipped migrations are never edited, only added to.

## Quality checks

CI runs on every push and pull request (Windows): Biome lint and format check, type check,
unit and integration tests with coverage thresholds, and Playwright E2E tests on the built app.
A second job packages the app, runs the same E2E tests against the packaged `Ahral.exe`, and
uploads the installer as a build artifact.

**Packaged-app test.** The E2E flow imports a PDF in the app and checks it produces exactly as many
questions as the pipeline run directly, so a dictionary, font or PDF.js file missing from the
package fails the build instead of reaching users.

**Releases.** Set the version in `package.json`, commit, then push a tag such as `v0.2.0`. The
release workflow checks the tag matches the version, runs all tests on the packaged app, and
attaches the installer to a GitHub release.

**Golden-file test.** `tests/integration/golden.test.ts` builds a PDF that reproduces the problems
found in real books (missing letters, two columns, running headers, Q&A layout), runs the full
pipeline, and compares the result with `tests/integration/__golden__/pipeline.txt`. A change in
extraction or question quality therefore shows up as a readable diff. After an intentional change,
review the diff and update the file with `npx vitest run -u`.

## Requirements

Node.js 24+ on Windows. No Rust, Python or C++ build tools needed.
