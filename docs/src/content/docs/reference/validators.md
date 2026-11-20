---
title: Validators
description: API reference for the validator system.
---

## Registration

```typescript
import { registerDefaultValidators, registerValidator } from 'formlayer';

// Register all 12 built-in validators at once
registerDefaultValidators();

// Register a single custom validator
registerValidator({
  type: 'MyValidator',
  validate(value, options) {
    return { valid: true, message: '' };
  },
});
```

## Validator Interface

```typescript
interface Validator {
  type: string;
  validate(
    value: FieldValue,
    options: Record<string, unknown>
  ): ValidatorResult | Promise<ValidatorResult>;
}

interface ValidatorResult {
  valid: boolean;
  message: string;
}
```

The `type` must match the `type` field in `data-validate` JSON rules.

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

Most validators pass on empty values by design. Combine with `NotEmpty` for required fields.

`MimeType` checks the type the browser reports for each selected file. It is a convenience for users: the server must still check the file content.

### Async validators

A validator may return a `Promise`, but field validation is synchronous in FormLayer 0.x: async validators are skipped (with a console error) and cannot block a submit. Run such checks on the server and return the errors from the submit response. First-class async validation is planned for v2.

## ValidatorRule (HTML format)

```typescript
interface ValidatorRule {
  type: string;
  options?: Record<string, unknown>;
}
```

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

// Synchronous (skips async validators with a warning)
const results = runValidators(rules, value);

// Async (awaits each validator)
const results = await runValidatorsAsync(rules, value);
```

Both return an array of failed `ValidatorResult` objects.
