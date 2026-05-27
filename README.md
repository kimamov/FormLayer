# FormLayer

Type-safe progressive enhancement for server-rendered HTML forms. No React, no Vue — just native `<form>` elements enhanced with TypeScript.

**Zero third-party runtime dependencies.** Optional field plugins (datepicker, altcha) are separate npm packages.

## Install

```bash
npm install formlayer
```

Optional plugins:

```bash
npm install @formlayer/plugin-datepicker   # Air Datepicker
npm install @formlayer/plugin-altcha       # ALTCHA captcha
```

## Quick start

```html
<form id="contact">
  <div data-form-field="email" data-validate='[{"type":"NotEmpty"},{"type":"EmailAddress"}]'>
    <label for="email">Email</label>
    <input id="email" type="email" name="email" />
    <div class="invalid-feedback"></div>
  </div>
  <button type="submit">Send</button>
</form>
```

```typescript
import { formRegistry, registerDefaultValidators } from 'formlayer';
import 'formlayer/forms.css';

registerDefaultValidators();

formRegistry.init(async (ctx) => {
  const response = await fetch(ctx.formEl.action, { method: 'POST', body: ctx.formData });
  ctx.finish('Thank you!');
});
```

## Optional plugins

```typescript
import { registerDatepickerPlugin } from '@formlayer/plugin-datepicker';
import { registerTypo3AltchaPlugin } from '@formlayer/plugin-altcha/typo3';
import { initTypo3Forms } from 'formlayer/typo3';

registerDatepickerPlugin();
registerTypo3AltchaPlugin();
initTypo3Forms();
```

## Package exports (tree-shakeable)

| Import | Use case |
|--------|----------|
| `formlayer` | Core API: registry, validators, `initField`, types |
| `formlayer/typo3` | TYPO3 EXT:form integration |
| `formlayer/validators` | Direct access to `runValidators` |
| `formlayer/plugins/combobox` | Built-in combobox plugin |
| `formlayer/plugins/client-variants` | Conditional field visibility |
| `formlayer/forms.css` | Default field/error styles |

## Related packages

| Package | Description |
|---------|-------------|
| `@formlayer/plugin-datepicker` | `data-field-type="datepicker"` (Air Datepicker) |
| `@formlayer/plugin-altcha` | Generic ALTCHA plugin |
| `@formlayer/plugin-altcha/typo3` | TYPO3 ALTCHA integration |

## Development

```bash
npm install
npm test
npm run build:all    # core + plugin packages
npm run docs:dev
```

## License

MIT
