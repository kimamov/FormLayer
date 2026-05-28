---
title: Error Rendering
description: Customize where field errors appear and how each message is rendered.
---

Validation decides **whether** a field failed. Error rendering controls **where** messages appear in the DOM and **how** they are formatted.

FormLayer ships with sensible defaults (`#input-id-errors`, then `.invalid-feedback`), but you can point at a different container, wrap each message in custom markup, or take over rendering entirely.

## Default behavior

For each field, FormLayer:

1. Adds `is-invalid` to the input and wrapper
2. Sets `aria-invalid="true"` and links the errors element via `aria-describedby` when it has an `id`
3. Writes error messages into the resolved errors container

**Lookup order** for the errors container:

1. `findErrorsElement` option (if set)
2. `#${input.id}-errors`
3. `#${group.id}-errors` for radio/checkbox groups
4. `errorsSelector` option (if set)
5. `.invalid-feedback` inside the field wrapper

**Default rendering** escapes each message and joins them with `<br/>`.

```html
<div data-form-field="email"
     data-validate='[{"type":"NotEmpty"},{"type":"EmailAddress"}]'>
  <label for="email">Email</label>
  <input id="email" type="email" name="email" />
  <div id="email-errors" class="invalid-feedback" role="alert"></div>
</div>
```

## Custom error container

Use `errorsSelector` when your markup uses a different class or places the container elsewhere inside the field wrapper — for example **above** the input instead of below it.

```html
<div data-form-field="username"
     data-validate='[{"type":"NotEmpty"}]'>
  <label for="username">Username</label>
  <!-- Errors above the input -->
  <ul class="field-errors" role="alert" aria-live="polite"></ul>
  <input id="username" type="text" name="username" />
</div>
```

```typescript
import { formRegistry } from 'formlayer';

formRegistry.init(submitFn, document, 'form[id]', {
  fieldOptions: {
    errorsSelector: '.field-errors',
  },
});
```

For markup that does not fit the built-in lookups at all, use `findErrorsElement`:

```html
<div data-form-field="phone" class="field-row">
  <input id="phone" type="tel" name="phone" />
  <!-- Errors live outside the usual wrapper subtree -->
</div>
<div id="phone-errors-panel" class="errors-panel" hidden></div>
```

```typescript
formRegistry.init(submitFn, document, 'form[id]', {
  fieldOptions: {
    findErrorsElement(field) {
      if (field.name === 'phone') {
        return document.getElementById('phone-errors-panel');
      }
      return field.element.querySelector('.invalid-feedback');
    },
  },
});
```

`findErrorsElement` takes precedence over `errorsSelector` and the id/class fallbacks.

## Custom message markup with icons

Use `renderError` to wrap each message — for example with an inline SVG icon — without replacing the whole rendering pipeline.

```typescript
const ERROR_ICON = `
  <svg class="field-error__icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15"/>
    <path fill="currentColor" d="M8 4.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4.5zm0 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
  </svg>`;

formRegistry.init(submitFn, document, 'form[id]', {
  fieldOptions: {
    renderError({ message, index }, field) {
      return `
        <span class="field-error" id="${field.name}-error-${index}" role="alert">
          ${ERROR_ICON}
          <span class="field-error__text">${escapeHtml(message)}</span>
        </span>`;
    },
    errorsSeparator: '',
  },
});

function escapeHtml(text: string): string {
  const el = document.createElement('div');
  el.textContent = text;
  return el.innerHTML;
}
```

Pair with CSS for layout:

```css
.field-error {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  color: #b42318;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.field-error__icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
}
```

`renderError` receives:

```typescript
interface FieldErrorRenderContext {
  message: string;
  index: number;
  errors: string[];
}
```

Use `errorsSeparator` when you want a different joiner between rendered fragments (default: `'<br/>'`). Set it to `''` when each `renderError` output is a block-level element.

## Full rendering override

When you need to render into multiple targets, animate entries, or clear/update state yourself, use `renderErrors`. It replaces the default pipeline entirely (`renderError` and `errorsSeparator` are ignored).

```typescript
import { initField } from 'formlayer';

const ctrl = initField(document.querySelector('[data-form-field="email"]')!, {
  renderErrors(errors, field) {
    const list = field.element.querySelector('.error-list') as HTMLOListElement;
    if (!list) return;

    list.replaceChildren(
      ...errors.map((message, index) => {
        const item = document.createElement('li');
        item.id = `${field.name}-error-${index}`;
        item.className = 'error-list__item';
        item.textContent = message;
        return item;
      }),
    );
    list.hidden = errors.length === 0;
  },
});
```

## Standalone fields

The same options work with `initField()`:

```typescript
import { initField } from 'formlayer';

const ctrl = initField(myElement, {
  errorsSelector: '[data-field-error]',
  renderError: ({ message }) => `<p class="hint hint--error">${message}</p>`,
  errorsSeparator: '',
});
```

See [Standalone Fields](/guides/standalone-fields/) for other field-level hooks.

## Form-level error summary

Field options control **per-field** containers. For a **form-wide** summary (banner, toast, error count), listen to `form:invalid` or pass `onFormInvalid` when registering the form.

```html
<form id="contact">
  <div id="form-summary" class="form-summary" hidden role="alert"></div>
  <!-- fields … -->
</form>
```

```typescript
formRegistry.register(formEl, submitFn, {
  onFormInvalid({ state }) {
    const summary = document.getElementById('form-summary')!;
    const messages = Object.values(state.fields).flatMap((field) => field.errors);

    if (messages.length === 0) {
      summary.hidden = true;
      summary.textContent = '';
      return;
    }

    summary.hidden = false;
    summary.textContent = messages.join(' ');
  },
});
```

`onFormInvalid` runs alongside the `form:invalid` event — use the event for decoupled listeners, the callback for imperative UI tied to registration. Neither replaces field-level rendering; they complement it.

For reactive UI, prefer the event:

```typescript
const form = formRegistry.get('contact');

form.on('form:invalid', ({ state }) => {
  document.getElementById('submit-hint')!.textContent =
    state.isValid ? '' : 'Please fix the highlighted fields.';
});

form.on('form:valid', () => {
  document.getElementById('submit-hint')!.textContent = '';
});
```

See [Events & Hooks](/guides/events/) for the full event reference.

## Apply to every field in a form

Pass shared field options through `FormControllerOptions.fieldOptions`:

```typescript
formRegistry.init(submitFn, document, 'form[id]', {
  fieldOptions: {
    errorsSelector: '[data-field-error]',
    renderError: ({ message, index }, field) => /* … */,
    errorsSeparator: '',
  },
  onFormInvalid: ({ state }) => { /* form summary … */ },
});
```

## Option reference

| Option | Scope | Purpose |
|--------|-------|---------|
| `errorsSelector` | Field | CSS selector scoped to the field wrapper |
| `findErrorsElement` | Field | Full override for resolving the errors container |
| `renderError` | Field | HTML for a single error message |
| `errorsSeparator` | Field | Joiner between rendered messages (default `<br/>`) |
| `renderErrors` | Field | Full override for writing errors to the DOM |
| `onFormInvalid` | Form | Callback when validation fails (client or server) |
| `form:invalid` | Form | Event with full `FormState` |

API details: [FieldController](/reference/field-controller/), [FormControllerApi](/reference/form-controller/).
