# formlayer-plugin-client-variants

Conditional field visibility form plugin for [FormLayer](https://github.com/your-org/formlayer).

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

Configure via `data-client-variants` on field wrappers. See the FormLayer docs for expression syntax.
