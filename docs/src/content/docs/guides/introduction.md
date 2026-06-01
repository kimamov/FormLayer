---
title: Introduction
description: What FormLayer is and how it works.
---

FormLayer is a lightweight TypeScript library for progressively enhancing server-rendered HTML forms. It provides client-side validation, field plugins, an event system, and an optional TYPO3 integration layer — all without requiring React, Vue, or any framework.

## How It Works

FormLayer scans your HTML for forms and fields marked with `data-*` attributes, then wraps each one in a controller that handles:

- **Validation** — declarative rules via `data-validate` JSON, with 12 built-in validators
- **State tracking** — dirty, touched, valid, submitting states per field and form
- **Loading UI** — `data-loading` on submit buttons during submission
- **Error display** — automatic ARIA-compliant error rendering
- **Plugins** — combobox, datepicker, or your own custom field enhancements
- **Events** — form-level and field-level event system for custom behavior
- **Submit handling** — pluggable submit functions with native fallback

Your server renders standard `<form>` HTML. FormLayer enhances it. If JavaScript fails to load, the native form still works.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Form path                                  │
│  FormRegistry (optional) / createFormController│
│  └── FormController (per <form>)            │
│      ├── createField → FieldController      │
│      ├── createField → custom FormField     │
│      │   (via fieldsMap / data-field-type)  │
│      ├── FormPlugin (e.g. client-variants)  │
│      └── EventBus (form/field events)       │
├─────────────────────────────────────────────┤
│  Standalone path (no registry)              │
│  initField / initFieldAsync                 │
│  └── FieldController or explicit { field }  │
└─────────────────────────────────────────────┘
```

## Key Concepts

### Forms and Fields

A **form** is any `<form>` element with an `id`. A **field** is any element inside a form with the `data-form-field` attribute. Each field must contain an `input`, `select`, or `textarea`.

```html
<form id="my-form">
  <div data-form-field="username">
    <label for="username">Username</label>
    <input id="username" type="text" />
  </div>
</form>
```

### The Registry

The `FormRegistry` discovers forms in the DOM and manages their lifecycle — useful for multi-form pages and TYPO3 remounting. For a single form, you can use `createFormController()` directly without the registry.

Standalone fields outside a form use `initField()` — see [Standalone Fields](/guides/standalone-fields/).

### Progressive Enhancement

FormLayer strips native HTML5 constraint attributes (`required`, `pattern`, `min`, `max`, etc.) and replaces them with its own validation pipeline. If JavaScript is disabled, browsers still enforce the native attributes. This is progressive enhancement — the baseline always works.

## Packages

FormLayer is split into two layers:

| Layer | Import | Purpose |
|-------|--------|---------|
| **Generic** | `import { formRegistry, initField } from 'formlayer'` | Framework-agnostic form/field controllers, validators, plugins, events, loading state |
| **TYPO3** | `import { initTypo3Forms } from 'formlayer/typo3'` | One-call setup for TYPO3 EXT:form with AJAX submit, multistep remounting, and hooks |

The generic layer has zero TYPO3 knowledge. The TYPO3 layer is a thin wrapper that configures the generic library with TYPO3-specific defaults.
