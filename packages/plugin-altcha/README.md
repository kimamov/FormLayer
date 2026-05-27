# @formlayer/plugin-altcha

ALTCHA captcha field plugins for [FormLayer](https://github.com/your-org/formlayer).

## Install

```bash
npm install formlayer @formlayer/plugin-altcha
```

## Generic usage

```typescript
import { registerAltchaPlugin } from '@formlayer/plugin-altcha';

registerAltchaPlugin();
```

## TYPO3 usage

Works with `bbysaeth/typo3-altcha` and FormLayer's TYPO3 integration:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import { registerTypo3AltchaPlugin } from '@formlayer/plugin-altcha/typo3';

registerTypo3AltchaPlugin();
initTypo3Forms();
```

HTML: `data-field-type="altcha"` on the field wrapper.
