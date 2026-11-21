# formlayer-plugin-client-variants

Conditional field visibility form plugin for [FormLayer](https://github.com/kimamov/FormLayer).

## Install

```bash
npm install formlayer formlayer-plugin-client-variants
```

## Usage

```typescript
import { formRegistry, registerDefaultValidators } from 'formlayer';
import { registerClientVariantsPlugin } from 'formlayer-plugin-client-variants';
import 'formlayer/forms.css';

registerDefaultValidators();
registerClientVariantsPlugin();
formRegistry.init(/* ... */);
```

With TYPO3:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import { registerClientVariantsPlugin } from 'formlayer-plugin-client-variants';

registerClientVariantsPlugin();
initTypo3Forms();
```

Configure via `data-client-variants` on field wrappers or on any container (fieldset, section) to show or hide a whole group. Hidden fields are skipped by validation, left out of the submitted data and count as empty in other conditions, so chained conditions settle. Conditions are evaluated before first paint; with `registerClientVariantsPlugin({ lazy: true })` add `[data-client-variants]:not([data-fl-evaluated]) { visibility: hidden; }`.

See the [Conditional Fields guide](https://kimamov.github.io/FormLayer/guides/conditional-fields/) for the expression syntax and server-side parity.
