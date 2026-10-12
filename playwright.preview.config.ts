import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Smoke-test the production bundle: the dev-server suite never loads the built
// worker, the vendored renderer under the built base path, or the bundled examples.
const basePath = process.env.PAGES_BASE_PATH || '/X3Diff/';
const url = `http://127.0.0.1:4174${basePath}`;
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: url },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    env: { PAGES_BASE_PATH: basePath },
    url,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
