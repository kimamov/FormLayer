# FormLayer Roadmap

This roadmap covers a **0.4 bugfix release** and **FormLayer v2**. It comes out of a review of the 0.3.x codebase and a comparison with current TypeScript form libraries.

**Goal for v2:** a small base library that is easy to extend with custom markup, field types, events and validators. A CMS integrator with a little TypeScript experience should be able to build something like a country combobox with flags and grouped options without touching keyboard handling or ARIA code.

Tracking issue: [#5](https://github.com/kimamov/FormLayer/issues/5). Each milestone is a sub-issue of it. The original drafts are kept in [`roadmap/issues/`](roadmap/issues/).

---

## Guiding decisions

1. **The server-rendered markup stays the source of truth.** JavaScript enhances markup that already exists. It only builds markup itself when none was rendered.
2. **Mirrored validators stay the default.** The server emits `data-validate` rules and the client runs the same rules.
3. **Server-authoritative validation is opt-in.** The core provides the mechanism: pending state, debounce, abort and error merging. Adapters provide the transport (the TYPO3 adapter is the first).
4. **One way to write a field, one way to configure one.** New fields use `defineField()`. Existing fields are configured with options at registration. Subclassing is not public API.
5. **No feature soup.** We take a few ideas from other libraries on purpose (see [Inspiration](#inspiration)) and leave the rest.

---

## Milestones

| # | Milestone | Issue | Depends on |
|---|-----------|-------|------------|
| 0 | 0.4 bugfix release | [#6](https://github.com/kimamov/FormLayer/issues/6) | — |
| 1 | Unified field core and `defineField()` | [#8](https://github.com/kimamov/FormLayer/issues/8) | 0 |
| 2 | Validation pipeline | [#9](https://github.com/kimamov/FormLayer/issues/9) | 1 |
| 3 | Opt-in server-authoritative validation (core) | [#7](https://github.com/kimamov/FormLayer/issues/7) | 2 |
| 4 | TYPO3 server-validation transport | [#10](https://github.com/kimamov/FormLayer/issues/10) | 3 |
| 5 | DOM events, submission result, form-level errors, plugins | [#11](https://github.com/kimamov/FormLayer/issues/11) | 1 |
| 6 | Combobox v2: markup-first, optgroups, render hooks | [#12](https://github.com/kimamov/FormLayer/issues/12) | 1, 2 |
| 7 | Scoped base CSS and per-plugin CSS | [#13](https://github.com/kimamov/FormLayer/issues/13) | — |
| 8 | Conditional logic: groups, chained conditions, no flash on load | [#14](https://github.com/kimamov/FormLayer/issues/14) | 1, 5 |
| 9 | Repeatable field groups | [#15](https://github.com/kimamov/FormLayer/issues/15) | 1, 2, 5 |

Milestones 5 and 7 can run in parallel with 2–4.

## Playground and capability check

[`playground/`](playground/) holds server-rendered form scenarios: contact, address, conditional fields, repeatable group, cross-field rules, multistep and widgets. A mock TYPO3-style backend and a Playwright capability check (`npm run playground:check`) go with them. Every milestone lists the checks it must turn green.

The baseline was **16 of 40 checks passing** on 0.3.x; the 0.4 fixes bring it to **23 of 40** ([CAPABILITIES.md](playground/CAPABILITIES.md), analysis in [FINDINGS.md](playground/FINDINGS.md)). Milestones 8 and 9 came out of this.

---

## 0 · 0.4 bugfix release

These are bugs in the current 0.3.x line. They are fixed without breaking the API.

| Bug | Location | Effect |
|-----|----------|--------|
| A class registered directly is detected as a lazy factory | `src/forms/create-field.ts:26` | `fn.length === 0` is also true for subclasses without an explicit constructor. The field is called as a function, throws, and is dropped with only a `console.warn`. This breaks Step 5 of the custom-fields guide. |
| Lazy fields ignore `fieldOptions` | `src/forms/form-controller.ts:249` | Custom `validate` and `renderErrors` options are lost for code-split fields. |
| No "ready" signal | `FormController` | A form submitted before its lazy fields have loaded skips validating them. |
| `FileSize` doesn't work in custom fields | `src/forms/abstract-dom-field.ts:193` | `__files` is never passed to the validators. |
| `finish()` doesn't unregister the form | `src/forms/form-controller.ts:356` | The registry keeps a destroyed controller. |
| Async validators are skipped | `src/forms/validators/index.ts:61` | A form passes even when an async rule fails. In 0.4 this is documented and logged as an error. The real fix is in milestone 2. |
| Radio and checkbox groups only react to their first control | `src/forms/field-controller.ts` `bind()` | Choosing the 2nd option directly doesn't update the value or the conditions (playground C10, K2, W2). |
| `formnovalidate` is ignored | `src/forms/form-controller.ts` submit handler | Multistep Back buttons are blocked by validation (M3). |
| `required` is stripped from inputs | `FieldController.disableNativeValidation()` | Screen readers no longer announce "required" (C2). |
| TYPO3 `Count` and `MimeType` are missing | `src/forms/validators/` | These TYPO3 rules silently pass (W1, W6). |

Housekeeping in the same release:

- Add `typecheck` and `test` jobs to CI, and fix the unused-import errors in `tests/`.
- Use one log prefix (`[FormLayer]`).
- Remove the leftover Vite starter files (`src/assets`, `form-demo/src/counter.ts`).

## 1 · Unified field core and `defineField()`

Today `FieldController` and `AbstractDomFormField` each implement validation, server errors, enable/disable and reset (about 200 duplicated lines), and they have already drifted apart. Writing a custom field means knowing a two-phase `init()`, `!` and `declare` on class fields, `setControlElement()`, and the right order of `markDirty` / `markTouched` / `validate` / `notifyChange`.

v2 has a single internal `BaseField`. The native input/select/textarea handling becomes a thin adapter on top of it. Authors write fields like this:

```ts
import { defineField } from 'formlayer';

export default defineField({
  setup(ctx) {
    const input = ctx.part<HTMLInputElement>('input');    // [data-fl-part="input"], or the first control
    input.addEventListener('input', () => ctx.commit(), { signal: ctx.signal });
    input.addEventListener('blur', () => ctx.touch(), { signal: ctx.signal });

    return {
      read: () => input.value,
      write: (value) => { input.value = String(value); },
      focus: () => input.focus(),        // optional
      reset: () => { input.value = input.defaultValue; }, // optional
      destroy: () => {},                 // optional
    };
  },
});
```

- **Registration is explicit:** `registerFieldType('rating', RatingField)` or `registerFieldType('rating', lazy(() => import('./rating')))`. No more counting constructor arguments.
- **Values:** `FieldValue = string | string[] | File[]`. Multi-selects and checkbox groups are no longer joined with commas.
- **Lifecycle names follow the browser's form-associated custom elements API** (reset, disabled, validity), so the concepts carry over.
- **Core ships a small auto-escaping `html` tagged template** for render hooks.

## 2 · Validation pipeline

- **Signature:** `validate(value, options, ctx)`, where `ctx` provides `field`, `form.getValue(name)`, `files` and `signal`. This replaces the `__files` hack and makes "confirm password" rules possible.
- **Async is first-class:**
  - an `isValidating` state;
  - outdated runs are aborted;
  - `form.validate()` awaits every field.
- **Typed options:** `defineValidator<{ minimum: number }>({ type, options: { minimum: Number }, validate })` converts attribute strings to the declared types.
- **Messages:**
  - A message sent by the server (`options.message`) wins.
  - Otherwise a `t(key, params)` resolver is used.
  - English is the fallback.
- **Triggers:** `data-validate-on="blur|change|submit"` per field, with a debounce for async rules.
- **Server-only rules:** rules marked `"server": true` (and unknown rule types) are no longer warned about and skipped. They are checked by server validation if it's enabled, and by the submit otherwise.

## 3 · Opt-in server-authoritative validation (core)

The core owns the mechanism. It doesn't know about any transport.

```ts
createFormController(form, submitFn, {
  serverValidation: {
    mode: 'client+server',                 // 'client' (default) | 'client+server' | 'server'
    validate: ({ fields, formData, signal }) => Promise<ServerValidationResult>,
    debounceMs: 300,
  },
});

interface ServerValidationResult {
  fields: Record<string, string[]>;   // only the requested fields; [] = valid
  form?: string[];                    // form-level errors
}
```

| Mode | Client rules | Server check on blur/change |
|------|--------------|-----------------------------|
| `client` | yes | never. Server-only rules are checked on submit. |
| `client+server` | yes, first | only for fields that have a `server: true` rule, and only once their client rules pass |
| `server` | no | every field |

The pipeline rules:

- At most one request in flight per form. Fields that change during the debounce are batched into one request.
- Server errors are merged with client errors. They stay until the field's value changes, using the same logic as today's submit errors.
- Transport failures never block the user. The client result stands, and the final submit is authoritative anyway.

## 4 · TYPO3 server-validation transport

- **Client (`formlayer/typo3`):** `createTypo3ServerValidation()` posts the full form data to `form.action` with `X-Form-Ajax: 1` and `X-Form-Validate: <field,field>`.
- **PHP (sitepackage, documented in `docs/…/typo3-backend.md`):** `AjaxFormSubmitMiddleware` gets a **validate-only** branch:
  - It binds `FormRuntime` the same way it does today and validates the current page.
  - It **does not** advance the page, update `__state`, render, or run finishers.
  - It returns `{ fields, form }`, filtered to the requested fields. Errors on fields hidden by client variants are already stripped.
- **`sitepackage:form.validationData`** emits `"server": true` for TYPO3 validators that have no client equivalent.

## 5 · DOM events, submission result, form-level errors, plugins

- **DOM events:** bubbling `CustomEvent`s such as `formlayer:field-change`, `formlayer:valid`, `formlayer:invalid`, a cancelable `formlayer:before-submit`, and `formlayer:submit-result`. They are typed through `HTMLElementEventMap` augmentation.
- **The internal bus stays.** `on()` now returns an unsubscribe function.
- **A standard submission result** `{ fields, form, redirect?, html?, finished? }` replaces the TYPO3-shaped JSON in core. `FormState` gains `formErrors`.
- **Controllers are stored in a `WeakMap`** keyed by the form element, so forms no longer need an `id`.
- **Plugins** can be loaded synchronously or lazily, take options, and get submit hooks (`beforeValidate`, `transformFormData`, `afterSubmit`).
- **The deprecated `submitTypo3Form` is removed.**

## 6 · Combobox v2

The reference implementation for "a custom field with custom markup". There are three customisation levels:

| Level | Who | How |
|-------|-----|-----|
| 1 | CMS integrator | Render the listbox in Fluid/HTML (flags, groups, anything). No TypeScript. |
| 2 | Integrator with a little TS | `registerComboboxPlugin({ renderOption, renderGroup, filter, messages })` |
| 3 | Developer | Write a new field with `defineField()` |

Markup-first: if `[data-fl-part="listbox"]` exists, it's used as is. Otherwise a listbox is generated from the `<select>`, including `<optgroup>`.

```html
<div data-form-field="country" data-field-type="combobox">
  <label for="country">Country</label>
  <select id="country" name="country">…native fallback…</select>
  <ul data-fl-part="listbox" hidden>
    <li role="group" aria-labelledby="grp-eu">
      <span id="grp-eu">Europe</span>
      <ul>
        <li role="option" data-value="DE"><img src="/flags/de.svg" alt=""> Germany</li>
      </ul>
    </li>
  </ul>
</div>
```

Bugs fixed in this rebuild:

- `aria-selected` was used for the highlighted option.
- The `<select>` id was not restored on destroy.
- The empty placeholder option could not be selected.
- UI strings were hardcoded English.
- Methods were private.

Playwright tests cover keyboard and ARIA behaviour.

## 7 · Scoped base CSS and per-plugin CSS

- `formlayer/base.css` contains only state styles, wrapped in `:where()` (zero specificity) and using `--fl-*` variables with fallbacks.
- Remove the dependencies on undefined variables (`--accent`, `--bg`, `--text-h`, …).
- Remove the global rules (`*` transitions, `form[id]` max-width, `.btn`).
- Combobox and ALTCHA styles move into their plugins.
- CSS class names become configurable instead of the fixed `CSS_CLASSES` constant.
- An optional accessible error summary with a live region.

---

## 8 · Conditional logic

- Conditions on whole groups (`data-client-variants` on a fieldset).
- Hidden fields count as empty in conditions, so chains settle.
- Conditions are evaluated before first paint (no flash).

## 9 · Repeatable field groups

- Built-in add and remove from a `<template>`, numbering, min/max, focus and announcements.
- The group registers as a field, so `Count` rules and group-level server errors have a place to render.
- Replaces the 38 lines of integrator code in the playground.

## Deliberately not doing

- Stimulus-style controllers, targets and values. Only `ctx.part()` survives.
- Public subclassing or `.extend()` of plugin fields.
- Field "behaviours" (`data-behaviors`).
- A `<form-layer>` web component entry point.
- Conform-style intents.
- Unpoly-style swapping of HTML fragments.
- Live Components.

Any of these can be reconsidered after v2 ships.

## Inspiration

Filtered to TypeScript libraries with a release in the last year (November 2026):

| Library | What we take |
|---------|--------------|
| Laravel Precognition 2.x | The protocol for server validation (validate-only header, debounce, `validating` state) → milestones 3–4 |
| TanStack Form | Validators keyed by trigger, `{ form, fields }` errors, async debounce → milestones 2–3 |
| Tom Select 2.x | `render.option` / `optgroup_header` hooks with an `escape` helper → milestone 6 |
| Symfony Forms + UX 3.x | The server template owns the markup and JS only adds behaviour → milestone 6 |
| django-formset 2.x | Form-level ("non-field") errors from the server → milestone 5 |
| Conform (future API) | A standard submission-result object → milestone 5 |

Dropped as inactive or not TypeScript: Stimulus (last release Aug 2023), Unpoly (plain JS), Hyperform, Parsley, jquery-validation-unobtrusive, Formie.
