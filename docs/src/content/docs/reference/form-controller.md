---
title: FormControllerApi
description: API reference for individual form controllers.
---

A `FormControllerApi` is returned by `formRegistry.register()` or `formRegistry.get()`. It controls a single `<form>` element.

## FormControllerOptions

Pass options as the third argument to `formRegistry.register()` or `formRegistry.init()`:

```typescript
interface FormControllerOptions {
  fieldSelector?: string;
  /** Options applied to every default FieldController in this form. */
  fieldOptions?: FieldControllerOptions;
  /** Map `data-field-type` values to custom FormField implementations. */
  fieldsMap?: CustomFieldsMap;
  loadingState?: false | FormLoadingStateOptions;
  onLoadingStateChange?: (detail: FormLoadingStateDetail) => void;
  /** Called when the form fails validation (client- or server-side). Complements form:invalid. */
  onFormInvalid?: (detail: FormEventDetail) => void;
}

interface FormLoadingStateOptions {
  attribute?: string;       // default: 'data-loading'
  submitSelector?: string;  // fallback when no submitter
}
```

### `fieldsMap`

A `CustomFieldsMap` maps `data-field-type` attribute values to custom `FormField` implementations. Each entry can be a class (sync) or a lazy factory (async):

```typescript
import type { CustomFieldsMap } from 'formlayer';

const fieldsMap: CustomFieldsMap = {
  combobox: ComboboxField,
  datepicker: () => import('./fields/datepicker'),
};
```

When a `[data-form-field]` wrapper has a matching `data-field-type`, the custom class is instantiated instead of the default `FieldController`. Fields without a matching entry fall back to `FieldController`.

See [Plugins](/guides/plugins/) for full usage examples and [Loading State](/guides/loading-state/) for loading UI.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The form's `id` attribute |

## Methods

### `getField(name)`

Returns a snapshot of a field's state, or `undefined`.

```typescript
const field = form.getField('email');
// { name: 'email', value: 'test@...', isValid: true, isDirty: true, isTouched: true, errors: [] }
```

### `getState()`

Returns the full form state.

```typescript
const state: FormState = form.getState();
// { id: 'contact', isValid: true, isSubmitting: false, isDirty: true, fields: { ... } }
```

### `validate()`

Validates all fields. Returns a promise resolving to `true` if all fields are valid. Focuses the first invalid field.

```typescript
const isValid = await form.validate();
```

### `submit()`

Triggers a programmatic form submission (equivalent to the user clicking submit).

```typescript
form.submit();
```

### `reset()`

Resets all fields to their default DOM values and clears validation state.

```typescript
form.reset();
```

### `destroy()`

Destroys the controller, aborts listeners, disconnects the mutation observer, and destroys all plugins.

```typescript
form.destroy();
```

### `addField(field)`

Adds a pre-constructed `FormField` instance to the form. If a field with the same name exists, the old one is destroyed first.

```typescript
form.addField(myCustomField);
```

### `addFieldFromElement(wrapper, options?)`

Creates and adds a field from a `[data-form-field]` wrapper element. Respects the form's `fieldsMap` when resolving the field type.

```typescript
const field = form.addFieldFromElement(wrapperEl);
```

### `removeField(name)`

Destroys and removes a field by name.

```typescript
form.removeField('phone');
```

### `on(event, handler)` / `once(event, handler)` / `off(event, handler)`

Subscribe to form and field events. Typed overloads ensure correct handler signatures.

```typescript
// Field events receive FieldEventDetail
form.on('field:change', (detail) => {
  detail.fieldName; // string
  detail.state;     // FieldState
});

// Form events receive FormEventDetail
form.on('form:submit', (detail) => {
  detail.state;     // FormState (isSubmitting is true)
});

form.on('form:loading', (detail) => {
  detail.state.isSubmitting; // true at start, false at end
});

// once() fires only once then auto-removes
form.once('form:valid', (detail) => { ... });
```

## State Types

### `FormState`

```typescript
interface FormState {
  id: string;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  fields: Record<string, FieldState>;
}
```

### `FieldState`

```typescript
interface FieldState {
  name: string;
  value: string;
  isValid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  errors: string[];
}
```

## FormSubmitContext

The submit function receives this context object with both data and action methods:

```typescript
interface FormSubmitContext {
  formEl: HTMLFormElement;
  formData: FormData;
  submitter: HTMLElement | null;
  signal: AbortSignal;

  fallbackToNative(): void;
  applyValidationErrors(errors: Record<string, string[]>): void;
  redirect(url: string): void;
  finish(html?: string): void;
}
```

The generic `finish()` action destroys the controller and optionally replaces the form element. The TYPO3 layer handles finish/unmount separately via `unmount` — see [TYPO3 Setup](/guides/typo3-setup/).
