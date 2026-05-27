# @formlayer/plugin-datepicker

Air Datepicker field plugin for [FormLayer](https://github.com/your-org/formlayer).

## Install

```bash
npm install formlayer @formlayer/plugin-datepicker
```

## Usage

```typescript
import { formRegistry, registerDefaultValidators } from 'formlayer';
import { registerDatepickerPlugin } from '@formlayer/plugin-datepicker';
import 'formlayer/forms.css';

registerDefaultValidators();
registerDatepickerPlugin();
formRegistry.init(/* ... */);
```

With TYPO3:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import { registerDatepickerPlugin } from '@formlayer/plugin-datepicker';

registerDatepickerPlugin();
initTypo3Forms();
```

HTML: `data-field-type="datepicker"` on the field wrapper.
