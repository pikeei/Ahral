# Ahral

An offline Windows desktop app that turns PDF reading material into practice exams
using rule-based text analysis. No generative AI, no cloud, no paid services.

> Status: Stage 1 (PDF text extraction). Question generation is not built yet.

## Stack

Electron · React · TypeScript · Tailwind CSS · SQLite (Node's built-in `node:sqlite`) ·
Vitest · Playwright · electron-builder

## Project layout

```
src/
  main/       Electron main process: database, file system, IPC handlers
  preload/    Typed bridge that exposes `window.api` to the UI
  renderer/   React UI (no Node access)
  shared/     Types shared by main and renderer (the IPC contract)
  core/       Pure TypeScript logic: PDF layout, analysis, question generation (from Stage 1)
tests/e2e/    Playwright tests that launch the real desktop app
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run typecheck` | Type-check main/preload and renderer separately |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Build, then launch the app and run Playwright tests |
| `npm run dist` | Build a Windows installer into `dist/` |
| `npm run extract -- <file.pdf> [--all] [--json]` | Print the sections and sentences extracted from a PDF |
| `npm run sample-pdf` | Generate `samples/demo-reviewer.pdf` to try extraction on |

`samples/` is git-ignored: put your own study PDFs there to test extraction locally.

## Requirements

Node.js 24+ on Windows. No Rust, Python or C++ build tools needed.
