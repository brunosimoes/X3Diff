import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { catalog } from './src/x3d/catalog.ts';

/**
 * coverage.html lists the catalogued node types. The list and its count are written into the
 * page from the catalog when it is served or built, so neither can drift from the engine.
 */
function coveragePage(): Plugin {
  const nodes = Object.keys(catalog).sort((a, b) => a.localeCompare(b));
  return {
    name: 'x3diff-coverage-page',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, context) =>
        context.path.endsWith('coverage.html')
          ? html
              .replaceAll('%X3D_NODE_COUNT%', String(nodes.length))
              .replace('<!--x3d-node-list-->', nodes.map((node) => `<li>${node}</li>`).join(''))
          : html,
    },
  };
}

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  plugins: [coveragePage()],
  optimizeDeps: {
    entries: ['app.html'],
    include: [
      '@xmldom/xmldom',
      'three',
      'three/addons/controls/OrbitControls.js',
      'three-mesh-bvh',
      'three-bvh-csg',
    ],
    exclude: ['x_ite'],
  },
  build: {
    rolldownOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app.html'),
        coverage: resolve(import.meta.dirname, 'coverage.html'),
      },
    },
  },
});
