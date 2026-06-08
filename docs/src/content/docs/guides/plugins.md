---
title: Plugins
description: Custom field types and form-level plugins.
---

FormLayer supports two extension mechanisms: **custom field types** (via `fieldsMap`) for replacing how individual fields render and behave, and **form plugins** for cross-cutting logic that operates on the form as a whole.

## Custom Field Types (`fieldsMap`)

Custom field types replace the default `FieldController` for specific `data-field-type` values. Each custom type implements the [`FormField`](/reference/types/#formfield-interface) interface.

For DOM-backed widgets (hidden native control + custom UI), extend [`AbstractDomFormField`](/reference/abstract-dom-field/) from `formlayer` — it provides validation, error rendering, server errors, enable/disable, and field events. Built-in plugins (combobox, datepicker) use this base class. See [Creating Custom Fields](/guides/custom-fields/) for a step-by-step **image input with preview** tutorial.

### Registering Custom Fields

Pass a `fieldsMap` to `FormControllerOptions`:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import { ComboboxField } from 'formlayer-plugin-combobox';
import { DatepickerField } from 'formlayer-plugin-datepicker';

initTypo3Forms({
  fieldsMap: {
    combobox: ComboboxField,
    datepicker: DatepickerField,
  },
});
```

When a `[data-form-field]` wrapper has `data-field-type="combobox"`, FormLayer instantiates `ComboboxField` instead of the default `FieldController`.

### Lazy-Loaded Custom Fields

Use a factory function for code-split custom fields that load on first use:

```typescript
initTypo3Forms({
  fieldsMap: {
    combobox: () => import('formlayer-plugin-combobox'),
    datepicker: () => import('formlayer-plugin-datepicker'),
  },
});
```

The factory must return `{ default: FormFieldClass }`, matching the standard dynamic `import()` convention.

### Combobox

Requires [`formlayer-plugin-combobox`](https://www.npmjs.com/package/formlayer-plugin-combobox):

```bash
npm install formlayer-plugin-combobox
```

Replaces a `<select>` with an accessible, searchable combobox (ARIA 1.2 pattern). The original `<select>` stays hidden and in sync for form submission. Implemented with [`AbstractDomFormField`](/reference/abstract-dom-field/) — the hidden `<select>` holds the canonical value while the text input is the active control.

```html
<div data-form-field="country" data-field-type="combobox"
     data-validate='[{"type":"NotEmpty","options":{"message":"Please select a country"}}]'>
  <label for="country">Country</label>
  <select id="country" name="country">
    <option value="">Select...</option>
    <option value="de">Germany</option>
    <option value="at">Austria</option>
    <option value="ch">Switzerland</option>
    <option value="fr">France</option>
    <option value="nl">Netherlands</option>
  </select>
  <div id="country-errors" class="invalid-feedback"></div>
</div>
```

The combobox supports:

- Type-ahead filtering
- Keyboard navigation (arrow keys, Enter, Escape, Home, End)
- ARIA labels and live regions
- Blur commit (selects closest match or reverts)

### Datepicker

Requires [`formlayer-plugin-datepicker`](https://www.npmjs.com/package/formlayer-plugin-datepicker):

```bash
npm install formlayer-plugin-datepicker
```

Wraps an input with the Air Datepicker library. Reads the date format from a hidden input (TYPO3 convention).

```html
<div data-form-field="startDate" data-field-type="datepicker"
     data-validate='[{"type":"DateTime","options":{"message":"Enter a valid date"}}]'>
  <label for="startDate">Start Date</label>
  <div data-field-type="datepicker">
    <input id="startDate" type="text" name="startDate" />
    <input type="hidden" name="startDate[dateFormat]" value="d.m.Y" />
  </div>
  <div id="startDate-errors" class="invalid-feedback"></div>
</div>
```

## Form Plugins

Form plugins operate on the entire form. They receive the `FormPluginHost` API for reading field values, toggling field visibility, and subscribing to events.

### Client Variants

Requires [`formlayer-plugin-client-variants`](https://www.npmjs.com/package/formlayer-plugin-client-variants):

```bash
npm install formlayer-plugin-client-variants
```

```typescript
import { registerClientVariantsPlugin } from 'formlayer-plugin-client-variants';

registerClientVariantsPlugin();
```

The `ClientVariantsPlugin` enables/disables fields based on conditions evaluated against other field values — replicating TYPO3's server-side variant logic on the client.

```html
<form id="registration">
  <div data-form-field="accountType" data-validate='[{"type":"NotEmpty"}]'>
    <label for="accountType">Account Type</label>
    <select id="accountType" name="accountType">
      <option value="">Select...</option>
      <option value="personal">Personal</option>
      <option value="business">Business</option>
    </select>
  </div>

  <div data-form-field="companyName"
       data-client-variants='[{"condition": "formValue(\"accountType\") === \"business\"", "enabled": true}]'
       data-validate='[{"type":"NotEmpty","options":{"message":"Company name is required"}}]'>
    <label for="companyName">Company Name</label>
    <input id="companyName" name="companyName" />
    <div id="companyName-errors" class="invalid-feedback"></div>
  </div>

  <div data-form-field="taxId"
       data-client-variants='[{"condition": "formValue(\"accountType\") === \"business\"", "enabled": true}]'
       data-validate='[{"type":"NotEmpty","options":{"message":"Tax ID is required for business accounts"}}]'>
    <label for="taxId">Tax ID</label>
    <input id="taxId" name="taxId" />
    <div id="taxId-errors" class="invalid-feedback"></div>
  </div>

  <button type="submit">Register</button>
</form>
```

When `accountType` is not `"business"`, the `companyName` and `taxId` fields are hidden, disabled, and excluded from validation. A hidden input `__clientVariantsDisabled` lists the disabled field names for the backend.

**Expression syntax** supports `formValue("fieldName")`, comparisons (`===`, `!==`, `>`, `<`, `>=`, `<=`), logical operators (`&&`, `||`, `!`), `in` operator, and string/number/boolean literals.

## Creating a Custom Field Type

**Recommended:** extend `AbstractDomFormField` and implement three hooks — `mount()`, `readValue()`, and `writeValue()`:

```typescript
import { AbstractDomFormField } from 'formlayer';

export default class ToggleField extends AbstractDomFormField {
  private hiddenInput!: HTMLInputElement;
  private toggle!: HTMLButtonElement;

  protected mount(): void {
    this.hiddenInput = this.wrapper.querySelector('input')!;
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'toggle-btn';
    this.toggle.textContent = this.readValue() === 'on' ? 'ON' : 'OFF';

    this.toggle.addEventListener('click', () => {
      const next = this.readValue() === 'on' ? 'off' : 'on';
      this.setValue(next);
      this.toggle.textContent = next === 'on' ? 'ON' : 'OFF';
    }, { signal: this.signal });

    this.hiddenInput.hidden = true;
    this.wrapper.appendChild(this.toggle);
    this.setControlElement(this.hiddenInput);
  }

  protected readValue(): string {
    return this.hiddenInput.value;
  }

  protected writeValue(value: string): void {
    this.hiddenInput.value = value;
    this.toggle.textContent = value === 'on' ? 'ON' : 'OFF';
  }

  protected onReset(): void {
    this.hiddenInput.value = this.hiddenInput.defaultValue;
    this.toggle.textContent = this.readValue() === 'on' ? 'ON' : 'OFF';
  }

  protected onDestroy(): void {
    this.toggle.remove();
    this.hiddenInput.hidden = false;
  }

  protected focusControl(): void {
    this.toggle.focus();
  }
}
```

Register and use it:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import ToggleField from './fields/toggle';

initTypo3Forms({
  fieldsMap: {
    toggle: ToggleField,
  },
});
```

```html
<div data-form-field="notifications" data-field-type="toggle">
  <label>Notifications</label>
  <input type="hidden" name="notifications" value="off" />
</div>
```

For a longer tutorial (preview UI, lifecycle diagrams, event wiring, checklist), see [Creating Custom Fields](/guides/custom-fields/). Implement [`FormField`](/reference/types/#formfield-interface) directly only when your field has no DOM wrapper or no single control element.

## Creating a Custom Form Plugin

Form plugins implement the `FormPlugin` interface and receive `FormPluginHost`:

```typescript
import type { FormPlugin, FormPluginHost } from 'formlayer';

export default class FormAnalyticsPlugin implements FormPlugin {
  private host!: FormPluginHost;

  async init(formEl: HTMLFormElement, host: FormPluginHost): Promise<void> {
    this.host = host;

    host.on('form:submit', (detail) => {
      analytics.track('form_submit', { formId: detail.formId });
    });

    host.on('form:invalid', (detail) => {
      const invalidFields = Object.entries(detail.state.fields)
        .filter(([, f]) => !f.isValid)
        .map(([name]) => name);
      analytics.track('form_validation_error', { fields: invalidFields });
    });
  }

  destroy(): void {}
}
```

Register form plugins via the registry:

```typescript
formRegistry.registerFormPlugin(() => import('./plugins/analytics'));
```
