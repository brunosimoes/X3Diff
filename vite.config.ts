import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
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
      },
    },
  },
});
