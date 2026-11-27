# Ahral

Turns PDF reading material into practice exams using rule-based text analysis.
No generative AI, no cloud, no paid services.

> Status: Stage 9 (website). Runs in any modern browser, on a phone too, with nothing to install.
> Also available as a Windows desktop app.

## Use it in your browser

Open **https://pikeei.github.io/Ahral/**. Everything runs inside your browser: the PDF is read
on your device and never uploaded, and the site makes no network requests after it loads.

- Your library and scores are saved in the browser's private storage for the site, so they're
  there next time, on that browser and device only. Clearing the site's data removes them.
- In some private windows the browser won't allow storage; Ahral then says so, and still works
  until the tab is closed.
- The first visit downloads about 4 MB (the app, PDF reader, SQLite and the dictionary).

The site is published automatically from `main` by the Website workflow
(`.github/workflows/website.yml`) after its tests pass.

## Windows desktop app

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

## Where questions come from

- **From the book.** If the PDF already has multiple-choice questions with an answer key, as review
  books do, Ahral imports them as written: same wording, same option order, and the book's own
  explanation with its page. These rank above generated questions. Tick only *From the book* for
  an exam closest to the real thing.
- **Generated.** Ahral also makes questions from the text itself: fill-in-the-blank sentences with
  a key term removed, and "pick the term" / "pick the definition" questions from the definitions it
  finds. The wrong options are other real definitions from the same document.

Question banks are recognised when questions are numbered ("12." or "12)"), options are lettered
("(A)", "A)", "A." or lowercase) and answers are given as "12. (C) explanation" in a key, or as
"Answer: C" after the options. Combination questions with numbered statements ("1 and 2 only") are
supported. Questions that refer to a figure are skipped, since the app can't show images, and so are
questions whose answer can't be found; the document's notes say how many.

## Stack

React · TypeScript · Tailwind CSS · SQLite (WebAssembly in the browser, Node's built-in
`node:sqlite` in the desktop app) · Vite · Electron · Vitest · Playwright · Biome

## Project layout

The screens and all the logic are shared; only the backend's host differs. On the website a
browser worker runs it; in the desktop app, Electron's main process does. The screens talk to
either through the same `window.api` calls.

```
src/
  app/         The backend, shared by both: database (db/), exam service (grading happens here),
               PDF import and pipeline. Works with any SQLite through a small interface.
  web/         The website: browser worker (SQLite WebAssembly, PDF import), window.api for the page
  main/        The desktop app: Electron main process, IPC handlers with input checks
  preload/     The desktop app's bridge that exposes `window.api` to the screens
  renderer/    React screens (no Node access): library, exam setup, exam, results
  shared/      Types shared by backend and screens (the API contract); answers never reach
               the screens before the user has answered
  core/        Pure TypeScript logic, no Electron or DOM:
    pdf/         PDF.js adapter and layout analysis (lines, columns, headers, blocks, sections)
    text/        Normalization, sentence splitting, answer comparison, missing-letter repair
    analysis/    Definitions, acronyms, key terms (TF-IDF)
    bank/        The document's own questions and answer key (review books)
    generation/  Sentence filter, fill-in-the-blank and multiple-choice questions, dedupe
    exam/        Seeded exam assembly, grading with explanations, scoring and weak sections
tests/
  integration/ Golden-file test of the whole pipeline (see below)
  web/         Playwright tests of the website in a real browser, desktop and phone size
  e2e/         Playwright tests that launch the real desktop app and run the full study loop
  fixtures/    Builders for test PDFs (generated, never committed as binaries)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run web:dev` | Run the website locally with hot reload (http://localhost:5173) |
| `npm run web:build` | Build the website into `dist-web/` |
| `npm run web:preview` | Serve the built website locally (http://localhost:4173) |
| `npm run test:web` | Build the website and test it in a browser, desktop and phone size |
| `npm run dev` | Run the desktop app with hot reload |
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

**After adding or updating a dependency, run `npm run lockfile`.** CI installs with npm 12, which
rejects a `package-lock.json` written by npm 11 (it leaves out entries npm 12 requires, and every
CI job then fails at `npm ci`). The script rewrites the lockfile with npm 12; both versions accept it.

## Database

Everything is stored locally in SQLite: in the browser's private storage for the site (the
Origin Private File System) on the website, `ahral.db` in the app's data folder for the desktop
app, and `data/ahral.db` for the CLIs. The same database code runs on all three.

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
