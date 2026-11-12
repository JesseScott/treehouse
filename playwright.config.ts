import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * End-to-end checks run against the *built* app served by `vite preview`.
 * Everything an agent needs to inspect a run lands in reports/e2e/.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'reports/e2e/artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/e2e/results.json' }],
    ['html', { outputFolder: 'reports/e2e/html', open: 'never' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'on',
    screenshot: 'on',
    launchOptions: {
      // Software WebGL, so the map renders the same on a laptop and on a CI runner.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/version.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
