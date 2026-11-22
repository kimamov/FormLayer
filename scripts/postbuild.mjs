import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsPublic = resolve(root, 'docs/public/formlayer');
// forms.css (deprecated alias) @imports base.css and theme.css, so all three travel together.
const stylesheets = ['base.css', 'theme.css', 'forms.css'];

for (const file of stylesheets) {
  cpSync(resolve(root, 'src/forms', file), resolve(root, 'dist/forms', file), { force: true });
}

// Sync ESM build to docs site for browser demos
rmSync(docsPublic, { recursive: true, force: true });
mkdirSync(docsPublic, { recursive: true });
cpSync(resolve(root, 'dist'), docsPublic, { recursive: true });
for (const file of stylesheets) {
  cpSync(resolve(root, 'src/forms', file), resolve(docsPublic, file), { force: true });
}

console.log('Postbuild: copied dist and stylesheets → docs/public/formlayer');
