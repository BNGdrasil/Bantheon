import { defineConfig } from 'vitest/config'

/**
 * Unit tests only. Everything under test is a pure function that was moved out
 * of a page component for this reason, so the run needs no DOM and no jsdom
 * dependency is installed for it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
