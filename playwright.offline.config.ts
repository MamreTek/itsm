import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'offline.spec.ts',
  outputDir: 'artifacts/offline-tests',
  timeout: 45000,
  use: { channel: 'chromium', viewport: { width: 1440, height: 1000 } },
});
