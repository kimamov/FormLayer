# @formlayer/plugin-combobox

Accessible combobox field plugin for [FormLayer](https://github.com/your-org/formlayer).

## Install

```bash
npm install formlayer @formlayer/plugin-combobox
```

## Usage

```typescript
import { formRegistry, registerDefaultValidators } from 'formlayer';
import { registerComboboxPlugin } from '@formlayer/plugin-combobox';
import 'formlayer/forms.css';

registerDefaultValidators();
registerComboboxPlugin();
formRegistry.init(/* ... */);
```

With TYPO3:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import { registerComboboxPlugin } from '@formlayer/plugin-combobox';

registerComboboxPlugin();
initTypo3Forms();
```

HTML: `data-field-type="combobox"` on the field wrapper.
