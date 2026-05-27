# AGENTS.md

Context for AI agents working in the **FormLayer** npm monorepo.

## Packages

| Package | Path | Third-party deps |
|---------|------|------------------|
| `formlayer` | `.` (root) | **None** |
| `@formlayer/plugin-datepicker` | `packages/plugin-datepicker/` | `air-datepicker` |
| `@formlayer/plugin-altcha` | `packages/plugin-altcha/` | `altcha` |

Core `formlayer` must never import `air-datepicker`, `altcha`, or other third-party libraries. Optional plugins live in separate packages with their own dependencies.

## Registering optional plugins

Plugins are **not** auto-registered by `initTypo3Forms()`. Consumers install and register explicitly:

```typescript
import { registerDatepickerPlugin } from '@formlayer/plugin-datepicker';
import { registerTypo3AltchaPlugin } from '@formlayer/plugin-altcha/typo3';
import { initTypo3Forms } from 'formlayer/typo3';

registerDatepickerPlugin();
registerTypo3AltchaPlugin();
initTypo3Forms();
```

Built-in plugins in core: **combobox**, **client-variants** only.

## Commands

```bash
npm test                  # core tests
npm run build             # core only → dist/
npm run build:plugins     # plugin packages
npm run build:all         # core + plugins
npm run docs:dev
```

Build core before plugins when types are needed. Workspace links `formlayer` into plugin packages via npm workspaces.

## Architecture rules

- `src/forms/` — TYPO3-agnostic, no third-party imports
- `src/typo3/` — TYPO3 integration, no third-party imports
- Third-party field plugins → `packages/plugin-*`
