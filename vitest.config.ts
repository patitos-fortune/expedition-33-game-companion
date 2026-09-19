import { defineConfig } from 'vitest/config'

// Deliberately no Vue plugin / jsdom environment here: v0.1's test suite targets
// the plain-TypeScript layers (game data loading/normalization, the optimizer,
// and state/persistence) rather than mounting Vue components. See README.md /
// OPTIMIZER_MODEL.md for why the optimizer is kept framework-free on purpose.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
