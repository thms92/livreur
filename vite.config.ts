import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Les worktrees vivent sous .claude/ : sans cette exclusion, chaque test
    // y est découvert une seconde fois et la suite tourne en double.
    exclude: ['node_modules/**', 'dist/**', '.claude/**'],
  },
})
