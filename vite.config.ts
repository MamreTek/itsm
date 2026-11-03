import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 15000,
    include: ['src/test/**/*.test.{ts,tsx}'],
  },
});
