import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssSource = resolve(root, 'src/forms/forms.css');
const docsPublic = resolve(root, 'docs/public/formlayer');

// Ensure CSS is available next to built modules for consumers using dist/forms/forms.css
cpSync(cssSource, resolve(root, 'dist/forms/forms.css'), { force: true });

// Sync ESM build to docs site for browser demos
rmSync(docsPublic, { recursive: true, force: true });
mkdirSync(docsPublic, { recursive: true });
cpSync(resolve(root, 'dist'), docsPublic, { recursive: true });
cpSync(cssSource, resolve(docsPublic, 'forms.css'), { force: true });

console.log('Postbuild: copied dist → docs/public/formlayer');
