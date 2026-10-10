import { defineConfig } from 'vitest/config'

// Behaviour tests for the block components (jsdom). The integrity and
// fabrication audits stay the pack's structural gate; these prove what a
// block DOES in a browser — what a form submits, what it tells the visitor.
export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
  esbuild: { jsx: 'automatic' },
  // One React for the test and for the engine packages, also when they are
  // linked from a local engine checkout that has its own node_modules.
  resolve: { dedupe: ['react', 'react-dom'] },
})
