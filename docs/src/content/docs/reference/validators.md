---
title: Validators
description: API reference for the validator system.
---

## Registration

```typescript
import { registerDefaultValidators, registerValidator, defineValidator, invalid, VALID } from 'formlayer';

// Register all built-in validators at once
registerDefaultValidators();

// Register a custom validator
registerValidator(defineValidator({
  type: 'MyValidator',
  options: { minimum: Number },
  validate(value, options, ctx) {
    return VALID;
  },
}));
```

Form-specific validators: `FormControllerOptions.validators` (or the `validators` field option) are looked up before the global registry.

## Validator Interface

```typescript
interface Validator {
  type: string;
  validate(
    value: FieldValue,                 // string | string[] | File[]
    options: Record<string, unknown>,
    ctx: ValidatorContext,
  ): ValidatorResult | Promise<ValidatorResult>;
}

interface ValidatorResult {
  valid: boolean;
  message?: string;                    // English default
  key?: string;                        // translation key, e.g. "StringLength.tooShort"
  params?: Record<string, unknown>;    // values for {placeholders}
}

interface ValidatorContext {
  field: { name: string; element: HTMLElement };
  form: { getValue(name: string): FieldValue | undefined };
  files: File[];
  signal: AbortSignal;                 // aborted when a newer run starts
  rule: ValidatorRule;
}
```

The `type` must match the `type` field in `data-validate` JSON rules.

### `defineValidator(definition)`

Builds a `Validator`. Options declared in `definition.options` are converted before `validate` runs: `Number`, `String`, `Boolean` (`true`, `"true"`, `"1"`), `Array` (arrays as-is, strings split on commas). Undeclared options are passed through. A non-empty `options.message` replaces the message of a failing result.

### `invalid(key, message, params?)` and `VALID`

Helpers for results: a failing result with a translation key, and the shared passing result.

### `setValidationMessages(messages)`

Global translations for message keys: an object (`{ key: 'text with {param}' }`) or a function `(key, params) => string | undefined`. Per-form `messages` take precedence; `options.message` in a rule always wins.

## Built-in Validators

| Type | Options | Passes on empty? |
|------|---------|-----------------|
| `NotEmpty` | `message` | No |
| `StringLength` | `minimum`, `maximum`, `message` | Yes |
| `EmailAddress` | `message` | Yes |
| `RegularExpression` | `regularExpression` (PCRE delimited), `message` | Yes |
| `NumberRange` | `minimum`, `maximum`, `message` | Yes |
| `Integer` | `message` | Yes |
| `Float` | `message` | Yes |
| `Number` | `message` | Yes |
| `Alphanumeric` | `message` | Yes |
| `DateTime` | `message` | Yes |
| `DateRange` | `minimum`, `maximum`, `message` | Yes |
| `FileSize` | `minimum`, `maximum` (e.g. `"5M"`), `message` | Yes |
| `MimeType` | `allowedMimeTypes` (array or comma list; wildcards like `image/*`), `message` | Yes |
| `Count` | `minimum`, `maximum`, `message`: number of selected values in a checkbox group or multi-select | Only if `minimum` is 0 |
| `Equals` | `field`, `message`: the value must equal that field's value | Yes |
| `DateNotBefore` | `field`, `message`: the date must not be before that field's date | Yes |
| `AtLeastOne` | `fields`, `message`: form-level (`data-validate-form`), at least one field filled | n/a |

Most validators pass on empty values by design. Combine with `NotEmpty` for required fields.

`MimeType` checks the type the browser reports for each selected file. It is a convenience for users: the server must still check the file content.

### Async validators

A validator may return a `Promise`. The field reports `isValidating: true` while it runs, a newer run aborts the older one through `ctx.signal`, and `form.validate()` and submitting wait for all results. See [Validation › Async validators](/guides/validation/#async-validators).

## ValidatorRule (HTML format)

```typescript
interface ValidatorRule {
  type: string;
  options?: Record<string, unknown>;
  server?: boolean;   // only checked on the server; skipped on the client without a warning
}
```

Rules whose `type` has no client validator are treated like `"server": true`.

Used in HTML as a JSON array:

```html
<div data-validate='[
  {"type":"NotEmpty","options":{"message":"Required"}},
  {"type":"StringLength","options":{"minimum":3}}
]'>
```

## Running Validators Programmatically

```typescript
import { runValidators, runValidatorsAsync } from 'formlayer/validators';

// Synchronous (skips async validators with an error)
const results = runValidators(rules, value, ctx?);

// Async (awaits each validator)
const results = await runValidatorsAsync(rules, value, ctx?);
```

Both return an array of failed `ValidatorResult` objects. `ctx` is a partial `ValidatorContext` (for example `{ form: { getValue } }`). Fields don't use these: they validate through the form pipeline, which also handles translations and server-only rules.
