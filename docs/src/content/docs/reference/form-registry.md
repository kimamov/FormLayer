---
title: FormRegistry
description: API reference for the FormRegistry class.
---

The `FormRegistry` manages all form controllers. Access via the exported `formRegistry` singleton.

```typescript
import { formRegistry } from 'formlayer';
```

## Single-form apps

For one form, skip the registry:

```typescript
import { createFormController, registerDefaultValidators } from 'formlayer';

registerDefaultValidators();
const form = createFormController(document.getElementById('contact')!, submitFn);
```

## Global validators and field types

Register globally via module-level APIs (not on the registry):

```typescript
import { lazy, registerValidator, registerFieldType } from 'formlayer';

registerValidator({ type: 'MyValidator', validate(value, options) { ... } });
registerFieldType('slider', lazy(() => import('./fields/slider')));
```

## Methods

### `init(options)`

Discovers and registers all matching forms.

```typescript
formRegistry.init({
  submitFn: FormSubmitFunction,
  root?: ParentNode,              // default: document
  formSelector?: string,          // default: 'form' (forms without field wrappers are skipped)
  controllerOptions?: FormControllerOptions,
}): void
```

### `register(formEl, submitFn, controllerOptions?)`

Registers a single form element. Returns the form controller API. No-ops if that element is already registered. Forms without an `id` get a generated one (`formlayer-1`, …).

```typescript
const api: FormControllerApi = formRegistry.register(formEl, submitFn);
```

### `unregister(formIdOrElement)`

Destroys the controller and removes the form from the registry.

```typescript
formRegistry.unregister('my-form');
formRegistry.unregister(formEl);
```

### `get(formIdOrElement)`

Returns the `FormControllerApi` for a registered form, or `undefined`.

```typescript
const form = formRegistry.get('contact');
const same = formRegistry.get(document.querySelector('form')!);
```

### `getAll()`

Returns a `Map<string, FormControllerApi>` of all registered forms.

### `on(event, handler)` / `off(event, handler)`

Subscribe to registry-level events. `on()` returns a function that unsubscribes.

```typescript
formRegistry.on('form:registered', ({ formId }) => { ... });
formRegistry.on('form:unregistered', ({ formId }) => { ... });
```

### `registerFormPlugin(source, options?)`

Registers a form-level plugin for all forms registered after this call. `source` is a plugin class (constructed per form with `options` and attached synchronously) or a lazy module loader.

```typescript
formRegistry.registerFormPlugin(AnalyticsPlugin, { category: 'contact' });
formRegistry.registerFormPlugin(() => import('./plugins/analytics'));
```

A form replaced by new markup (multistep) is registered again with the same options and plugins.

## Global Access

The registry is also available globally as `window.__FormsModule` (browser environments only).
