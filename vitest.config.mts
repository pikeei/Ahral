import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit and integration tests live next to the code they test.
    // E2E tests (tests/e2e) are run by Playwright, not Vitest.
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
