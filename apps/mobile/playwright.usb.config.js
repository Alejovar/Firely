import { defineConfig } from '@playwright/test';

// These integration tests use the web/API services, not the Glass demo preview.
export default defineConfig({
  testDir: './tests-usb',
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.FIRELY_BROWSER ? { executablePath: process.env.FIRELY_BROWSER } : {},
  },
});
