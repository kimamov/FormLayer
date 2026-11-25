# formlayer-plugin-combobox

Accessible combobox field plugin for [FormLayer](https://github.com/kimamov/FormLayer).

## Install

```bash
npm install formlayer formlayer-plugin-combobox
```

## Usage

```typescript
import { formRegistry, registerDefaultValidators } from 'formlayer';
import { registerComboboxPlugin } from 'formlayer-plugin-combobox';
import 'formlayer/base.css';
import 'formlayer-plugin-combobox/style.css';

registerDefaultValidators();
registerComboboxPlugin();
formRegistry.init(/* ... */);
```

With TYPO3:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import { registerComboboxPlugin } from 'formlayer-plugin-combobox';

registerComboboxPlugin();
initTypo3Forms();
```

HTML: `data-field-type="combobox"` on a field wrapper with a `<select>`. `<optgroup>`s become groups.

Render the listbox yourself (flags, icons) with `<ul data-fl-part="listbox" hidden>` inside the wrapper, or customise the generated one:

```typescript
registerComboboxPlugin({
  renderOption: (option, { html }) => html`<span aria-hidden="true">${option.data.flag}</span> ${option.label}`,
  messages: { noResults: 'Keine Treffer' },
});
```

Full guide: https://github.com/kimamov/FormLayer/blob/main/docs/src/content/docs/guides/combobox.md
