import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-mobile',
  testMatch: '*.e2e.mjs',
  workers: 1,
  timeout: 45_000,
  use: {
    actionTimeout: 10_000, screenshot: 'only-on-failure',
    baseURL: 'http://127.0.0.1:5174', viewport: { width: 393, height: 852 },
    launchOptions: { executablePath: process.env.FIRELY_BROWSER || '/usr/bin/brave-browser', args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npx vite preview --outDir mobile-dist --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174', reuseExistingServer: false,
  },
});
