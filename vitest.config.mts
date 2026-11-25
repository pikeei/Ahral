import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests live next to the code they test; integration tests that span the whole
    // pipeline live in tests/integration. E2E tests (tests/e2e) are run by Playwright.
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The pure logic is where coverage is meaningful; Electron and React glue is covered by E2E.
      include: ['src/core/**/*.ts', 'src/main/db.ts'],
      exclude: ['**/*.test.ts', '**/test-helpers.ts', '**/types.ts'],
      reporter: ['text-summary', 'html'],
      // Set a little below current levels (99% lines, 91% branches): CI fails on a real drop,
      // not on a small refactor. Raise them as coverage improves.
      thresholds: {
        lines: 97,
        branches: 88,
        functions: 95,
        statements: 95
      }
    }
  }
})
