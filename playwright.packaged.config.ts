import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The same E2E tests, run against the packaged app (dist/win-unpacked/Ahral.exe)
// instead of the development build. Catches files missing from the package,
// paths that only work in the source tree, and anything else that breaks in asar.
// Run with: npm run test:packaged
process.env.AHRAL_EXECUTABLE ??= resolve('dist/win-unpacked/Ahral.exe')

export default defineConfig({
  ...base,
  outputDir: 'test-results/packaged'
})
