---
title: Server Validation
description: Opt-in validation against the server while the user fills in the form.
---

By default FormLayer validates on the client with the rules in `data-validate`, mirrored from the server. Some rules can only run on the server, like "this email is already registered" or a custom PHP validator. Others you may simply not want to duplicate. **Server validation** checks those fields against the server while the user fills in the form, so they don't have to wait for the submit.

It is opt-in, per form. The submit is always validated by the server anyway.

## Modes

| Mode | Client rules | Server check when a field is validated |
|------|--------------|----------------------------------------|
| `client` (default) | yes | never; server-only rules are checked by the submit |
| `client+server` | yes, first | for fields with a server-only rule, once their client rules pass |
| `server` | no | every field; the submit goes straight to the server |

A rule is server-only when it is marked `"server": true`, or when no client validator exists for its type:

```html
<div data-form-field="email"
     data-validate='[{"type":"NotEmpty"},{"type":"EmailAddress"},{"type":"UniqueEmail","server":true}]'>
```

Server checks follow the same timing as client validation: when the user leaves a field they edited, when they choose a value, and while they fix a field that shows an error. See [When validation runs](/guides/validation/#when-validation-runs).

## Setting it up

FormLayer schedules the checks; you provide the transport, a `validate` function that asks your server:

```typescript
import { formRegistry } from 'formlayer';
import type { ServerValidationOptions } from 'formlayer';

const serverValidation: ServerValidationOptions = {
  mode: 'client+server',
  async validate({ fields, formData, signal, form }) {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'X-Form-Validate': fields.join(',') },
      body: formData,
      signal,
    });
    if (!response.ok) throw new Error(`Validation request failed: ${response.status}`);
    return response.json(); // { fields: { email: ['…'] }, form?: ['…'] }
  },
};

formRegistry.init({ submitFn, controllerOptions: { serverValidation } });
```

With TYPO3 you don't need a transport: `initTypo3Forms()` includes one (see [below](#typo3)).

A form can choose its own mode in the markup, which overrides `mode`:

```html
<form id="signup" data-server-validation="client+server" …>
```

Without a `validate` function the form stays in `client` mode.

## The request and the answer

`validate` receives:

| | |
|-|-|
| `fields` | Names (`data-form-field`) of the fields to check |
| `formData` | The whole form's data, so the server sees what it would see on submit |
| `signal` | Aborted when a newer request replaces this one, or the form submits |
| `form` | The `<form>` element |

It returns `{ fields, form? }`:

- `fields` maps each requested field to its errors. `[]` or a missing key means valid.
- `form` lists form-level errors. They are rendered into `[data-fl-form-errors]` and included in `formErrors`.

The server should validate **without saving anything**, and only report on the requested fields. In a multistep form, it should validate the current step.

## Scheduling

- Fields that ask within the debounce window (`debounceMs`, default 300 ms) share one request.
- At most one request per form is in flight. A newer one aborts it and takes over its fields.
- While a field waits, its state has `isValidating: true`.
- An answer about a value the user has changed since is ignored.
- Server errors stay until the value changes, like errors from a submit.
- Submitting cancels pending checks: the submit response is authoritative.

## When the server can't answer

A network error, an error status or invalid JSON never blocks the user:

- the field keeps its client result;
- `isValidating` is cleared;
- the submit still works;
- the form dispatches a bubbling `formlayer:server-validation-error` event with `{ error, fields }`.

```typescript
form.addEventListener('formlayer:server-validation-error', (event) => {
  console.warn('Live validation unavailable', (event as CustomEvent).detail);
});
```

## TYPO3

`initTypo3Forms()` sets up `createTypo3ServerValidation()` for you. Forms opt in in the markup, and only AJAX-enabled forms (`data-ajax="1"`) take part:

```html
<form id="contact" data-ajax="1" data-server-validation="client+server" …>
```

```typescript
initTypo3Forms();                                          // TYPO3 transport, off until a form opts in
initTypo3Forms({ serverValidation: { mode: 'client+server', debounceMs: 400 } }); // on for every AJAX form
initTypo3Forms({ serverValidation: false });               // never
```

The transport posts the whole form to its `action` with `X-Form-Ajax: 1` and `X-Form-Validate: <field>,<field>`. It maps answers keyed by element identifier or by full name (`tx_form_formframework[contact][email]`) onto the fields. The sitepackage middleware needs a validate-only branch for this; see [Backend (PHP) › Validate-only requests](/guides/typo3-backend/#validate-only-requests).

## Try it

The playground has both modes: `01-contact` uses `client+server` (try `taken@example.com`), and `08-server-mode` uses `server`.
