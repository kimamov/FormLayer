---
title: Conditional Fields
description: Show and hide fields and whole groups based on other fields' values.
---

The `formlayer-plugin-client-variants` package shows and hides fields depending on other fields' values. Conditions use the same `formValue("…")` syntax as TYPO3's client variants, so the server and the browser agree on which fields count.

```typescript
import { registerClientVariantsPlugin } from 'formlayer-plugin-client-variants';
import { initTypo3Forms } from 'formlayer/typo3';

registerClientVariantsPlugin();
initTypo3Forms();
```

## On a field

Put `data-client-variants` on the field wrapper. The field is shown when a variant with `"enabled": true` matches, and hidden otherwise:

```html
<div data-form-field="phone"
     data-client-variants='[{"condition":"formValue(\"contactPreference\") == \"phone\"","enabled":true}]'
     data-validate='[{"type":"NotEmpty"}]'>
  <label for="phone">Phone</label>
  <input id="phone" name="phone" type="tel" autocomplete="tel">
</div>
```

## On a group

Put it on any container in the form, such as a `fieldset` or a `section`, to show or hide a whole group. Every field inside is hidden and disabled with it:

```html
<div data-form-field="shippingSameAsBilling">
  <input type="checkbox" id="same" name="shippingSameAsBilling" value="1" checked aria-controls="shipping">
  <label for="same">Ship to the billing address</label>
</div>

<fieldset id="shipping"
          data-client-variants='[{"condition":"formValue(\"shippingSameAsBilling\") != \"1\"","enabled":true}]'>
  <legend>Shipping address</legend>
  …required fields…
</fieldset>
```

`aria-controls` on the controlling input tells assistive technology which region it affects. Focus stays where the user is when content appears.

## What hidden means

A hidden field (on its own or through its group):

- is skipped by validation, so hidden required fields never block the submit;
- is disabled, so it is left out of the submitted data;
- counts as **empty** (`''`) in other conditions;
- is listed in a hidden `__clientVariantsDisabled` input, so the backend knows which fields to ignore.

Because hidden fields count as empty, **chains settle**. If "account manager" depends on "company size", which depends on "company", unticking "company" hides both, even though "company size" still holds its old value. When "company" is ticked again, that value comes back. Conditions are re-evaluated until nothing changes. Circular conditions are stopped with a console warning.

## No flash on load

With `registerClientVariantsPlugin()` the plugin attaches synchronously and evaluates every condition while the form is set up, before the browser first paints. Conditional fields never flash visible.

If you load it lazily (`registerClientVariantsPlugin({ lazy: true })`), add this rule so elements stay invisible until their condition has been evaluated. Evaluated elements get `data-fl-evaluated`:

```css
[data-client-variants]:not([data-fl-evaluated]) { visibility: hidden; }
```

## Condition syntax

`formValue("name")` reads a field's value, as a string (lists joined with commas). Supported:

| | |
|-|-|
| Comparison | `==`, `!=`, `===`, `!==`, `>`, `<`, `>=`, `<=` |
| Logic | `&&`, `\|\|`, `!`, or `and`, `or`, `not` |
| Membership | `formValue("country") in ["DE", "AT", "CH"]` |
| Literals | strings, numbers, `true`, `false` |
| Grouping | `( … )` |

## On the server

The server must agree on which fields are hidden, or it rejects the submit for missing hidden fields. With TYPO3 the sitepackage's `ClientVariantsValidationListener` disables fields whose conditions fail before validation (see [Backend (PHP)](/guides/typo3-backend/#client-variants-server-side)). Conditions on **containers** must be handled there too: every field inside a failing container has to be disabled.
