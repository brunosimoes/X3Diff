import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Limit discovery to the unit tests of this checkout.
    include: ['tests/**/*.test.ts'],
  },
});
