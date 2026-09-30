import { cpSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(project, 'node_modules', 'x_ite', 'dist');
const destination = join(project, 'public', 'vendor', 'x_ite');
mkdirSync(destination, { recursive: true });
for (const name of ['x_ite.min.mjs', 'x_ite.css', 'LICENSE.md']) {
  copyFileSync(join(source, name), join(destination, name));
}
cpSync(join(source, 'assets'), join(destination, 'assets'), { recursive: true, force: true });
const licenses = join(project, 'public', 'vendor', 'licenses');
mkdirSync(licenses, { recursive: true });
for (const [name, file] of [
  ['xmldom-LICENSE.txt', join(project, 'node_modules', '@xmldom', 'xmldom', 'LICENSE')],
  ['three-LICENSE.txt', join(project, 'node_modules', 'three', 'LICENSE')],
  ['three-bvh-csg-LICENSE.txt', join(project, 'node_modules', 'three-bvh-csg', 'LICENSE')],
  ['three-mesh-bvh-LICENSE.txt', join(project, 'node_modules', 'three-mesh-bvh', 'LICENSE')],
])
  copyFileSync(file, join(licenses, name));
console.log('Copied pinned X_ITE 16.4.1 browser assets into public/vendor/x_ite.');

copyFileSync(join(project, 'licenses', 'Web3D-license.txt'), join(licenses, 'Web3D-license.txt'));
copyFileSync(join(project, 'THIRD_PARTY_NOTICES.md'), join(licenses, 'THIRD_PARTY_NOTICES.md'));
copyFileSync(join(project, 'LICENSE'), join(licenses, 'X3Diff-MIT.txt'));
