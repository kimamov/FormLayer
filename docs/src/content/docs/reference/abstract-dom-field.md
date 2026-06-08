---
title: AbstractDomFormField
description: Base class for custom DOM-backed field types.
---

`AbstractDomFormField` is the recommended base class for custom field types that replace or augment native controls. It implements the full [`DomFormField`](/reference/types/#domformfield) interface — the same contract as [`FieldController`](/reference/field-controller/), plus hooks for custom DOM and value synchronization.

Built-in plugins such as [combobox](/guides/plugins/#combobox) and [datepicker](/guides/plugins/#datepicker) extend this class. For a step-by-step walkthrough, see [Creating Custom Fields](/guides/custom-fields/).

## When to use it

| Scenario | Use |
|----------|-----|
| Standard `input`, `select`, or `textarea` with no custom UI | [`FieldController`](/reference/field-controller/) (default) |
| Custom widget that keeps a native control for submission | `AbstractDomFormField` |
| Fully custom UI with no native control | Implement [`FormField`](/reference/types/#formfield-interface) directly |

`AbstractDomFormField` handles state, validation, server errors, enable/disable, error rendering, and field events. You implement DOM construction and value read/write.

## Constructor

```typescript
new AbstractDomFormField(wrapper: HTMLElement, options?: AbstractDomFieldOptions)
```

Do not instantiate directly. Extend the class, override the hooks, and create instances through `createField()`, `initField()`, or a registered `fieldsMap` entry — those drive the lifecycle for you.

```typescript
export default class MyField extends AbstractDomFormField {
  private control!: HTMLInputElement;

  protected mount(): void {
    this.control = this.wrapper.querySelector('input')!;
    this.setControlElement(this.control);
  }
}
```

The constructor only reads `data-form-field` and parses `data-validate`. Setup that touches the DOM — `mount()`, error presentation, and the initial state snapshot — runs in `init()`, which the field factories call immediately after construction. This keeps the overridable `mount()` out of the constructor, so ordinary class fields like `private control!: HTMLInputElement` work without any special handling. If `mount()` does not call `setControlElement()`, `init()` throws.

## Subclass hooks

These methods define how your field interacts with the DOM. The base class calls them at the appropriate lifecycle points. Assign fields in `mount()` as you normally would — it runs after the instance is fully constructed.

### `mount(): void` *(required)*

Build custom UI and register the focus/validation control:

```typescript
protected mount(): void {
  this.fileInput = this.wrapper.querySelector('input[type="file"]')!;
  this.buildPreview();
  this.bindEvents();
  this.setControlElement(this.fileInput);
}
```

Call `setControlElement()` exactly once with the element that receives focus, `aria-*` error classes, and the `disabled` state from `setEnabled()`.

### `readValue(): string` *(required)*

Return the canonical string value used for validation and form state. This may differ from what the user sees — for example, a combobox reads from a hidden `<select>` while displaying option labels in a text input.

### `writeValue(value: string): void` *(required)*

Apply a programmatic value (via `setValue()` or form reset). Not all controls support this (file inputs cannot be set for security reasons).

### `focusControl(): void`

Focus the interactive control. Default: `this.input.focus()`. Override when focus should land on a different element than `inputElement` (e.g. a combobox text input).

### `onReset(): void`

Restore custom DOM to initial values when `reset()` is called. The base class clears validation state afterward; you restore control values and UI.

### `onDestroy(): void`

Tear down custom DOM and third-party instances when `destroy()` is called. The base class aborts listeners via `AbortSignal` before this runs.

## Protected helpers

| Helper | Purpose |
|--------|---------|
| `setControlElement(el)` | Register the active input for focus, validation UI, and `setEnabled()` |
| `signal` | `AbortSignal` for `{ signal }` on event listeners; aborted in `destroy()` |
| `markDirty()` | Set `isDirty` on the internal state |
| `markTouched()` | Set `isTouched` on the internal state |
| `notifyChange()` | Re-read value, emit `change` / `valid` / `invalid`, notify the form via `connect()` |
| `updateErrorDOM(isValid, errors)` | Update error classes and messages (usually called by `validate()`) |
| `parseRules()` | Parse `data-validate` JSON into `ValidatorRule[]` (also runs in constructor) |

### Event flow

Custom fields must call validation and notification explicitly — unlike `FieldController`, the base class does not bind `input` / `blur` / `change` automatically:

```typescript
this.control.addEventListener('blur', () => {
  this.markTouched();
  this.validate();
  this.notifyChange();
}, { signal: this.signal });

this.control.addEventListener('input', () => {
  this.markDirty();
}, { signal: this.signal });
```

Call `setValue()` when the user commits a new value; it writes the DOM, validates, and notifies in one step.

## Public API

Inherits the same surface as [`FieldController`](/reference/field-controller/):

| Property / method | Description |
|-------------------|-------------|
| `name` | `data-form-field` attribute value |
| `element` | The wrapper element |
| `inputElement` | The control set via `setControlElement()` |
| `fieldType` | `data-field-type` attribute, or `null` |
| `enabled` | Whether the field participates in validation |
| `getState()` | Snapshot of `FieldState` |
| `setValue(value)` | Write value, mark dirty/touched, validate, notify |
| `validate()` | Run validators and update error DOM |
| `setServerErrors(errors)` | Apply server-side errors (cleared when value changes) |
| `setEnabled(enabled)` | Show/hide wrapper, toggle `disabled`, skip validation when off |
| `reset()` | Calls `onReset()`, clears state and errors |
| `destroy()` | Aborts listeners, calls `onDestroy()`, tears down emitter |
| `connect(onChange)` | Wire into parent form (internal; prefer `on('change')` standalone) |
| `focus()` | Calls `focusControl()` |
| `replaceInput(newInput)` | Swap the active control element |
| `on` / `once` / `off` | Field-level `change`, `valid`, `invalid` events |

## AbstractDomFieldOptions

Same as [`FieldOptions`](/reference/types/#fieldcontrolleroptions) / [`FieldControllerOptions`](/reference/field-controller/#fieldcontrolleroptions):

```typescript
type AbstractDomFieldOptions = FieldOptions;
```

Supports custom validation, server error transformation, and error rendering hooks. See [Error Rendering](/guides/error-rendering/).

## Differences from FieldController

- **No automatic event binding** — you wire listeners in `mount()` using `this.signal`.
- **No native constraint stripping** — remove `required`, `pattern`, etc. yourself if needed.
- **No debounced input validation** — call `validate()` when appropriate (typically on blur or commit).
- **No checkbox/radio/file group handling** — implement in `readValue()` / `writeValue()` if needed.
- **File validators** — `FieldController` passes `__files` to validators for file inputs; override `options.validate` or call `runValidators` with extra context if you need file-aware rules.

## Registration

Export your class as default and register via `fieldsMap`:

```typescript
import { initTypo3Forms } from 'formlayer/typo3';
import ImageInputWithPreviewField from './fields/image-input-with-preview';

initTypo3Forms({
  fieldsMap: {
    'image-input-with-preview': ImageInputWithPreviewField,
  },
});
```

Or lazy-load:

```typescript
fieldsMap: {
  'image-input-with-preview': () => import('./fields/image-input-with-preview'),
}
```

The factory must resolve to `{ default: FormFieldClass }`.
