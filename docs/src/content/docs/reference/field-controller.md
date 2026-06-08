---
title: FieldController
description: API reference for individual field controllers.
---

A `FieldController` wraps a single form field (a `[data-form-field]` wrapper containing an `input`, `select`, or `textarea`). It implements the [`DomFormField`](/reference/types/#domformfield) interface. Get one via `initField()` or interact with fields through the parent form controller.

For custom field types that replace or augment native controls, extend [`AbstractDomFormField`](/reference/abstract-dom-field/) instead of reimplementing validation and lifecycle. See [Creating Custom Fields](/guides/custom-fields/) for a full walkthrough.

## Constructor

```typescript
new FieldController(wrapper: HTMLElement, options?: FieldControllerOptions)
```

Usually created via `initField()` rather than directly.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The `data-form-field` attribute value |
| `element` | `HTMLElement` | The wrapper element |
| `inputElement` | `HTMLInputElement \| HTMLSelectElement \| HTMLTextAreaElement` | The active input |
| `fieldType` | `string \| null` | The `data-field-type` attribute, or null |
| `enabled` | `boolean` | Whether the field is enabled |

## Methods

### `getState()`

Returns a snapshot of the current field state.

```typescript
const state: FieldState = ctrl.getState();
// { name, value, isValid, isDirty, isTouched, errors }
```

### `setValue(value)`

Sets the input value, marks as dirty/touched, validates, and notifies listeners.

### `validate()`

Runs validation and returns a `FieldValidationResult`.

```typescript
const result = ctrl.validate();
// { isValid: boolean, errors: string[] }
```

### `setServerErrors(errors)`

Applies server-side validation errors. Errors persist until the value changes.

```typescript
ctrl.setServerErrors(['This email is already registered']);
```

### `setEnabled(enabled)`

Shows/hides the field, enables/disables the input, and excludes from validation when disabled.

### `reset()`

Restores the input to its default DOM value (`defaultValue`, `defaultChecked`, `defaultSelected`) and clears validation state.

### `destroy()`

Aborts listeners and restores native validation attributes.

### `connect(onChange)`

Wires field state changes into a parent callback (used internally by `FormController`). For standalone use, prefer `on('change', ...)`.

### `replaceInput(newInput)`

Swaps the active input element (e.g., a custom field type hides the select and uses a text input).

### `on(event, handler)` / `once(event, handler)` / `off(event, handler)`

Field-level events.

```typescript
ctrl.on('change', (state: FieldState) => { ... });
ctrl.on('valid', (state: FieldState) => { ... });
ctrl.on('invalid', (state: FieldState) => { ... });
```

## FieldControllerOptions

```typescript
interface FieldErrorRenderContext {
  message: string;
  index: number;
  errors: string[];
}

interface FieldControllerOptions {
  validate?(
    value: string,
    rules: ValidatorRule[],
    defaultValidate: () => FieldValidationResult
  ): FieldValidationResult;

  onServerErrors?(errors: string[], fieldName: string): string[];

  /** CSS selector scoped to the field wrapper. Used after id-based lookups. */
  errorsSelector?: string;

  /** Resolve the errors container. Takes precedence over errorsSelector and built-in lookups. */
  findErrorsElement?(field: FieldController): HTMLElement | null;

  /** Render a single error message as HTML. Ignored when renderErrors is set. */
  renderError?(ctx: FieldErrorRenderContext, field: FieldController): string;

  /** Join rendered error fragments. Default: `'<br/>'`. Ignored when renderErrors is set. */
  errorsSeparator?: string;

  /** Replace the entire error rendering step. When set, renderError and errorsSeparator are ignored. */
  renderErrors?(errors: string[], ctx: FieldController): void;
}
```

See [Error Rendering](/guides/error-rendering/) for examples (custom containers, inline icons, form summaries).

### `validate`

Override the validation pipeline. Receives the current value, parsed rules, and a `defaultValidate` function you can call to run the standard validators. Return a `FieldValidationResult`.

### `onServerErrors`

Transform or filter server errors before they are applied. Return the modified array.

### `errorsSelector` / `findErrorsElement`

Control which element receives error messages. Built-in lookup tries `#${input.id}-errors`, then group ids, then `errorsSelector`, then `.invalid-feedback`.

### `renderError` / `errorsSeparator`

Customize per-message HTML while keeping the default container resolution. `renderError` must return safe HTML if messages can contain user input — escape text yourself.

### `renderErrors`

Replace the default error rendering entirely. Called with the error array and the field controller instance.

## FieldValidationResult

```typescript
interface FieldValidationResult {
  isValid: boolean;
  errors: string[];
}
```
