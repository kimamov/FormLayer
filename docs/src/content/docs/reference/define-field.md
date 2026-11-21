---
title: defineField
description: API reference for defining custom field types.
---

`defineField()` creates a field class from a `setup()` function. See [Creating Custom Fields](/guides/custom-fields/) for a walkthrough.

```typescript
import { defineField } from 'formlayer';

export default defineField({
  setup(ctx) {
    const input = ctx.control<HTMLInputElement>();
    input.addEventListener('input', () => ctx.input(), { signal: ctx.signal });
    input.addEventListener('change', () => ctx.commit(), { signal: ctx.signal });
    input.addEventListener('blur', () => ctx.touch(), { signal: ctx.signal });
    return {
      read: () => input.value,
      write: (value) => { input.value = String(value); },
    };
  },
});
```

The returned class can be registered with `registerFieldType()`, used in a form's `fieldsMap`, or passed to `initField(wrapper, { field })`.

## `FieldDefinition`

```typescript
interface FieldDefinition {
  setup(ctx: FieldContext): FieldAdapter;
}
```

`setup()` runs once per field wrapper, when the field is created.

## `FieldContext`

| Member | Type | Description |
|--------|------|-------------|
| `wrapper` | `HTMLElement` | The `[data-form-field]` wrapper |
| `name` | `string` | The field name (`data-form-field`) |
| `signal` | `AbortSignal` | Aborted when the field is destroyed. Pass it to every `addEventListener` |
| `options` | `FieldOptions` | The field options passed to the form or `initField()` |
| `part<T>(name)` | `T` | The element with `data-fl-part="name"` inside the wrapper. Throws if missing |
| `parts<T>(name)` | `T[]` | All elements with `data-fl-part="name"` |
| `control<T>()` | `T` | The first `input`, `select` or `textarea`. Throws if there is none |
| `controls()` | `FormControl[]` | All `input`, `select` and `textarea` elements in the wrapper |
| `setControl(el)` | `void` | The element(s) that receive focus, `aria-invalid` and the error link. Default: the first control |
| `input()` | `void` | The user is editing: marks dirty; validates after a pause once touched; notifies the form |
| `commit()` | `void` | The user committed a value: marks dirty and touched, validates and notifies now |
| `touch()` | `void` | The user left the field: marks touched, validates and notifies |

## `FieldAdapter`

| Member | Required | Description |
|--------|----------|-------------|
| `read(): FieldValue` | yes | Read the current value from the DOM |
| `write(value: FieldValue): void` | yes | Write a value to the DOM |
| `focus(): void` | no | Focus the field. Default: the first control |
| `reset(): void` | no | Restore the initial DOM state. Default: `write()` the value read during setup |
| `disabled(isDisabled: boolean): void` | no | Called after the field was disabled or enabled (controls are already toggled) |
| `destroy(): void` | no | Remove created DOM and free resources |

## `FieldValue`

```typescript
type FieldValue = string | string[] | File[];
```

Helpers exported from `formlayer`:

| Function | Description |
|----------|-------------|
| `valueToString(value)` | Lists joined with commas, files as their names |
| `valueToList(value)` | `''` → `[]`, a string → `[string]`, lists as they are |
| `isEmptyValue(value)` | `true` for `''` (after trimming) and `[]` |
| `isFileValue(value)` | `true` for a `File[]` |

## Field instance API

Every field (custom or native) implements the same API:

| Member | Description |
|--------|-------------|
| `name`, `element`, `inputElement`, `fieldType`, `enabled` | Identity and the main control |
| `getState()` | `{ name, value, isValid, isDirty, isTouched, errors }` |
| `validate()` | Run the rules and update the error UI |
| `setValue(value)` | Write a value, mark dirty and touched, validate, notify |
| `setServerErrors(errors)` | Show server errors until the value changes |
| `setEnabled(enabled)` | Show/enable or hide/disable the field |
| `reset()`, `focus()`, `destroy()` | Lifecycle |
| `on` / `once` / `off` | `'change'`, `'valid'`, `'invalid'` events |

## `html` and `raw`

```typescript
import { html, raw } from 'formlayer';

const item = html`<li data-value="${code}">${label}</li>`; // DocumentFragment
```

Interpolated strings and numbers are escaped (in text and in quoted attributes). Nodes, fragments and arrays are inserted as nodes. `null`, `undefined` and `false` render nothing. `raw(markup)` inserts trusted markup unescaped.

## `NativeField`

The built-in field for native controls, used when a wrapper has no `data-field-type`. `FieldController` is a deprecated alias.
