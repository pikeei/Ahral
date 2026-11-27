import { defineConfig, devices } from '@playwright/test'

// End-to-end tests of the website (tests/web), against the built site served locally,
// at desktop size and on an emulated phone. Run with: npm run test:web
const CHANNEL = process.env.PW_CHANNEL ?? 'msedge'

export default defineConfig({
  testDir: 'tests/web',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/web' }]] : 'list',
  outputDir: 'test-results/web',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    // A browser already installed, so nothing is downloaded: Edge on Windows, or the one named
    // in PW_CHANNEL (CI uses "chrome", which GitHub's Linux machines have).
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: CHANNEL } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: CHANNEL } }
  ],
  webServer: {
    command: 'npm run web:preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
