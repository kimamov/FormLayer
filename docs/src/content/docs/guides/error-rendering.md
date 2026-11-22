---
title: Error Rendering
description: Styles, where field errors appear, how they are announced, and the error summary.
---

Validation decides **whether** a field failed. Error rendering controls **where** messages appear in the DOM and **how** they are formatted.

FormLayer ships with sensible defaults (`#input-id-errors`, then `.invalid-feedback`), but you can point at a different container, wrap each message in custom markup, or take over rendering entirely.

## Styles

Two stylesheets, both optional:

```typescript
import 'formlayer/base.css';  // field states only: invalid, hidden, loading
import 'formlayer/theme.css'; // optional look for inputs, selects, groups
```

- **`base.css`** styles states, not your design. It keys on the attributes FormLayer sets (`aria-invalid`, `hidden`, `data-loading`), so it works whatever class names you configure. It also makes `hidden` win over layout rules such as `.field { display: flex }`, which conditional fields need.
- **`theme.css`** gives inputs, selects, textareas and groups inside `[data-form-field]` a neutral look. Skip it if your site already styles forms.

Every rule is wrapped in `:where()`, so it has **zero specificity**: any rule of yours wins without `!important`. Colours come from variables you can set anywhere:

```css
:root {
  --fl-error: #b3261e;   /* error text and borders */
  --fl-error-bg: #fce8e6;
  --fl-focus: #0b57d0;   /* focus outline */
  --fl-accent: #0b57d0;  /* theme.css: checked controls */
  --fl-radius: 0.375rem; /* theme.css */
  --fl-border: #767676;  /* theme.css */
}
```

Dark mode values are built in. Plugins ship their own styles, so you import only what you use:

```typescript
import 'formlayer-plugin-combobox/style.css';
import 'formlayer-plugin-altcha/style.css';
```

`formlayer/forms.css` still works. It now imports `base.css` and `theme.css` and is **deprecated**: import those two instead, plus the plugin styles you need, because `forms.css` no longer contains combobox or ALTCHA styles.

## Class names

FormLayer toggles Bootstrap's classes by default: `is-invalid` on invalid controls and wrappers, and `invalid-feedback` to find the error container. Use other names with `classes`:

```typescript
formRegistry.init({
  submitFn,
  controllerOptions: { classes: { invalid: 'has-error', errorMessage: 'field-error' } },
});

// TYPO3
initTypo3Forms({ classes: { invalid: 'has-error', errorMessage: 'field-error' } });
```

`aria-invalid` is always set, so `base.css` works with any class names.

## Announcements

An error that appears when the user **leaves or changes** a field is announced through one polite live region per page (`[data-fl-live-region]`, created on first use). The announcement waits half a second so it doesn't talk over the screen reader reading the next field, reads as "Email: Enter a valid email address.", and is cleared once the field is fixed. Nothing is announced while typing.

After a failed **submit** nothing is announced: focus moves to the first problem (or the error summary), which reads its error.

Don't put `role="alert"` or `aria-live` on error containers. The live region already announces errors, and both together read every error twice. Turn announcements off with `fieldOptions: { announceErrors: false }`. Custom fields can use the same region:

```typescript
import { announce, clearAnnouncement } from 'formlayer';

announce('3 results available', this);
clearAnnouncement(this); // only clears what `this` announced
```

While the user presses a submit button, blur validation waits until the click. Otherwise an error appearing on blur could push the button down before the click lands. The submit validates anyway, and a `formnovalidate` button (Back) skips it.

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
  <div id="email-errors" class="invalid-feedback"></div>
</div>
```

## Custom error container

Use `errorsSelector` when your markup uses a different class or places the container elsewhere inside the field wrapper — for example **above** the input instead of below it.

```html
<div data-form-field="username"
     data-validate='[{"type":"NotEmpty"}]'>
  <label for="username">Username</label>
  <!-- Errors above the input -->
  <ul class="field-errors"></ul>
  <input id="username" type="text" name="username" />
</div>
```

```typescript
import { formRegistry } from 'formlayer';

formRegistry.init({
  submitFn,
  controllerOptions: {
    fieldOptions: {
      errorsSelector: '.field-errors',
    },
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
formRegistry.init({
  submitFn,
  controllerOptions: {
    fieldOptions: {
      findErrorsElement(field) {
        if (field.name === 'phone') {
          return document.getElementById('phone-errors-panel');
        }
        return field.element.querySelector('.invalid-feedback');
      },
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

formRegistry.init({
  submitFn,
  controllerOptions: {
    fieldOptions: {
      renderError({ message, index }, field) {
        return `
          <span class="field-error" id="${field.name}-error-${index}">
            ${ERROR_ICON}
            <span class="field-error__text">${escapeHtml(message)}</span>
          </span>`;
      },
      errorsSeparator: '',
    },
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

## Error summary

For long forms, add an empty error summary at the top of the form. After a failed submit FormLayer fills it with a heading and a link to each problem, and focuses it instead of the first field:

```html
<form>
  <div data-fl-error-summary data-fl-error-summary-title="There is a problem"></div>
  <!-- fields … -->
</form>
```

- Each link jumps to its field and focuses it. Form-level errors are listed too.
- The list follows the user's fixes and empties (and hides) once everything is valid.
- `data-fl-error-summary-title` sets the heading (default "There is a problem").

Without a summary, focus moves to the first invalid field, which is the better choice for short forms.

## Your own summary

For a banner, toast or error count, listen to `form:invalid` or pass `onFormInvalid` when registering the form:

```typescript
formRegistry.register(formEl, submitFn, {
  onFormInvalid({ state }) {
    const count = Object.values(state.fields).filter((field) => !field.isValid).length;
    document.getElementById('submit-hint')!.textContent = `${count} fields need attention.`;
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
formRegistry.init({
  submitFn,
  controllerOptions: {
    fieldOptions: {
      errorsSelector: '[data-field-error]',
      renderError: ({ message, index }, field) => /* … */,
      errorsSeparator: '',
    },
    onFormInvalid: ({ state }) => { /* form summary … */ },
  },
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
| `announceErrors` | Field | Announce errors that appear on blur/change (default `true`) |
| `classes` | Form | `invalid` and `errorMessage` class names (default Bootstrap) |
| `data-fl-error-summary` | Form | Error summary filled and focused after a failed submit |
| `onFormInvalid` | Form | Callback when validation fails (client or server) |
| `form:invalid` | Form | Event with full `FormState` |

API details: [FieldController](/reference/field-controller/), [FormControllerApi](/reference/form-controller/).
