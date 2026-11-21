# FormLayer playground

Server-rendered form scenarios for building new FormLayer features and finding the library's limits early, so they don't end up as integrator work.

```bash
npm run playground         # http://localhost:5180
npm run playground:check   # runs all scenarios in Chromium → CAPABILITIES.md
```

`playground:check` needs Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`.

## How it is set up

- **Pages** (`scenarios/*.html`) are plain HTML, written the way a CMS would render them. FormLayer and the plugins are imported **from source** (`vite.config.ts` aliases), so library changes show up without a build.
- **Mock backend** (`server/`) answers like the TYPO3 sitepackage middleware:
  - `X-Form-Ajax: 1` returns the TYPO3 JSON response.
  - `X-Form-Validate: a,b` returns validate-only `{ fields, form }` (roadmap milestones 3–4).
  - Without either header it returns an HTML page (the no-JS fallback).

  Every form's rules are re-implemented server-side in `server/forms.ts`, including server-only rules and form-level errors (`__form`). The multistep form is rendered entirely by the server.
- **Server validation** uses the built-in TYPO3 transport against the mock's `X-Form-Validate` support. `01-contact` uses `client+server` mode, `08-server-mode` uses `server` mode.
- **Integrator code** (`src/integrator/`) is what an integrator has to write today for things the library doesn't cover. Its size is tracked as a finding. The goal is to shrink it to nothing.
- **Debug panel**: every page has a collapsible "FormLayer events" log at the bottom.

## Scenarios

| Page | Exercises |
|---|---|
| `01-contact` | Validation timing, required fields, radio group, consent checkbox, server-only rule (`taken@example.com`), form-level server error (message containing "spam"), success message |
| `02-address` | Nested names (`billing[city]` ↔ `billing.city`), `billing`/`shipping` autocomplete, a whole fieldset toggled by a checkbox |
| `03-conditional` | Radio-driven fields, "other, please specify", chained conditions, hidden fields left out of validation, flash on load |
| `04-repeatable` | Add/remove rows from a `<template>`, per-row server errors, 1–5 row limits, focus and announcements |
| `05-cross-field` | Password confirmation, date range, re-validating dependent fields, form-level "phone or backup email" rule |
| `06-multistep` | Steps rendered by the server, focus on step change, `formnovalidate` Back button, server errors on step 2 |
| `07-widgets` | Checkbox group with `Count`, combobox with `<optgroup>` and a server-rendered flag listbox, file upload with `FileSize`/`MimeType` |
| `08-server-mode` | `data-server-validation="server"`: client rules skipped, every field checked by the mock server, submit straight to the server |

## Markup conventions

The markup follows current web.dev / modern-web-guidance form practice, kept deliberately simple:

- A visible `<label for>` before every text control, and after every checkbox or radio. `fieldset` + `legend` for groups.
- `required` plus a visible `*` marked `aria-hidden="true"`.
- Fitting `type`, `autocomplete` (scoped with `billing`/`shipping` where needed), `inputmode` and `enterkeyhint`. Autocorrect is off for identifiers.
- Hints are linked with `aria-describedby`. Error containers (`#<id>-errors`) are **not** referenced in the markup: FormLayer links them only while the field is invalid.
- `type="button"` on helper buttons. No inline JavaScript. Every form has `action`, `method="post"` and works without JS.
- `[data-fl-form-errors]` is the container for form-level errors, and `data-fl-part="listbox"` marks a server-rendered combobox listbox. Both are v2 target markup (roadmap issues `06` and `07`).

## Adding a scenario

1. Add `scenarios/NN-name.html` with `<script type="module" src="/src/main.ts">`.
2. Add the server-side rules to `server/forms.ts` under the form's `id`, posting to `/api/forms/<id>`.
3. Add checks to `check.mjs` that state the **expected** behaviour, plus the roadmap issue that should make them pass.
4. Run `npm run playground:check` and update `FINDINGS.md`.
