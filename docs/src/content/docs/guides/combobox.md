---
title: Combobox
description: A searchable, accessible select with groups, flags or any custom markup.
---

`formlayer-plugin-combobox` turns a `<select>` into a searchable combobox (the ARIA 1.2 editable combobox with list autocomplete). The `<select>` stays in the form, hidden, and holds the submitted value, so the field still works without JavaScript.

```bash
npm install formlayer-plugin-combobox
```

```typescript
import { registerComboboxPlugin } from 'formlayer-plugin-combobox';
import { initTypo3Forms } from 'formlayer/typo3';
import 'formlayer/base.css';
import 'formlayer-plugin-combobox/style.css';

registerComboboxPlugin();
initTypo3Forms();
```

Put `data-field-type="combobox"` on the field wrapper. There are three ways to customise it:

| Level | For | How |
|-------|-----|-----|
| 1 | CMS integrators | Render the listbox in Fluid or HTML: flags, groups, anything. No TypeScript. |
| 2 | A little TypeScript | `registerComboboxPlugin({ renderOption, renderGroup, renderEmpty, filter, messages })` |
| 3 | Developers | Write your own field with [`defineField()`](/guides/custom-fields/). The combobox source is the reference. |

## The basic field

```html
<div data-form-field="country" data-field-type="combobox"
     data-validate='[{"type":"NotEmpty","options":{"message":"Choose a country."}}]'>
  <label for="country">Country</label>
  <select id="country" name="country" required>
    <option value="">Choose a country</option>
    <optgroup label="Europe">
      <option value="AT">Austria</option>
      <option value="DE">Germany</option>
    </optgroup>
    <optgroup label="Americas">
      <option value="CA">Canada</option>
      <option value="US" data-search="usa america">United States</option>
    </optgroup>
  </select>
  <p id="country-errors" class="invalid-feedback"></p>
</div>
```

- The visible input takes over the select's `id`, so `<label for>` keeps labelling it. `aria-describedby` and `required` carry over.
- `<optgroup>`s become labelled groups. Group labels are skipped by the arrow keys.
- The empty first option becomes the input's placeholder.
- `data-search` adds search terms. Matching ignores case and accents: "osterreich" finds "Österreich".
- Disabled options are shown but can't be chosen.

## Level 1: server-rendered listbox

Add the listbox you want to the wrapper, marked `data-fl-part="listbox"` and `hidden`. FormLayer uses it as is: filtering only toggles `hidden` on options and groups. Without JavaScript it stays hidden and the plain `<select>` is used.

```html
<div data-form-field="country" data-field-type="combobox" data-combobox-no-results="No country found">
  <label for="country">Country</label>
  <select id="country" name="country" required>
    <option value="">Choose a country</option>
    <optgroup label="Europe">
      <option value="AT">Austria</option>
      <option value="DE">Germany</option>
    </optgroup>
  </select>
  <ul data-fl-part="listbox" hidden>
    <li role="group" aria-labelledby="country-europe">
      <span id="country-europe">Europe</span>
      <ul role="none">
        <li role="option" data-value="AT"><span aria-hidden="true">🇦🇹</span> Austria</li>
        <li role="option" data-value="DE" data-search="deutschland"><span aria-hidden="true">🇩🇪</span> Germany</li>
      </ul>
    </li>
  </ul>
  <p id="country-errors" class="invalid-feedback"></p>
</div>
```

The rules:

- Each `role="option"` needs a `data-value` that exists in the `<select>`.
- The input shows the option's text without `aria-hidden` parts ("Germany", not "🇩🇪 Germany"). Set `data-label` to use other text.
- Groups are `role="group"` with `aria-labelledby` (or `aria-label`), and the options are inside a `role="none"` list.
- `data-combobox-no-results` and `data-combobox-toggle` set the "No results" message and the toggle button's label, so translations can come from the CMS.

### TYPO3 Fluid partial

A country select with flags and continent groups, as a custom form element. The options and the listbox are rendered from the same data, so they can't drift apart:

```yaml
# Form definition
type: CountrySelect
identifier: country
label: Country
properties:
  groups:
    Europe:
      AT: { label: Austria, flag: 🇦🇹 }
      DE: { label: Germany, flag: 🇩🇪 }
    Americas:
      CA: { label: Canada, flag: 🇨🇦 }
      US: { label: United States, flag: 🇺🇸, search: 'usa america' }
```

```html
<!-- Resources/Private/Frontend/Partials/CountrySelect.html -->
<html xmlns:f="http://typo3.org/ns/TYPO3/CMS/Fluid/ViewHelpers"
      xmlns:formvh="http://typo3.org/ns/TYPO3/CMS/Form/ViewHelpers"
      data-namespace-typo3-fluid="true">
<formvh:renderRenderable renderable="{element}">
  <!-- Your field wrapper: data-form-field and data-validate as for other fields, plus the type. -->
  <div data-form-field="{element.identifier}" data-field-type="combobox"
       data-combobox-no-results="{f:translate(key: 'combobox.noResults', extensionName: 'Sitepackage')}">
    <label for="{element.uniqueIdentifier}">{formvh:translateElementProperty(element: element, property: 'label')}</label>

    <f:form.select property="{element.identifier}" id="{element.uniqueIdentifier}">
      <f:form.select.option value="">Choose a country</f:form.select.option>
      <f:for each="{element.properties.groups}" as="countries" key="continent">
        <f:form.select.optgroup label="{continent}">
          <f:for each="{countries}" as="country" key="code">
            <f:form.select.option value="{code}">{country.label}</f:form.select.option>
          </f:for>
        </f:form.select.optgroup>
      </f:for>
    </f:form.select>

    <ul data-fl-part="listbox" hidden>
      <f:for each="{element.properties.groups}" as="countries" key="continent" iteration="group">
        <li role="group" aria-labelledby="{element.uniqueIdentifier}-group-{group.index}">
          <span id="{element.uniqueIdentifier}-group-{group.index}">{continent}</span>
          <ul role="none">
            <f:for each="{countries}" as="country" key="code">
              <li role="option" data-value="{code}" data-search="{country.search}">
                <span aria-hidden="true">{country.flag}</span> {country.label}
              </li>
            </f:for>
          </ul>
        </li>
      </f:for>
    </ul>

    <p id="{element.uniqueIdentifier}-errors" class="invalid-feedback"></p>
  </div>
</formvh:renderRenderable>
</html>
```

In the frontend, `registerComboboxPlugin()` is the only code needed.

## Level 2: render hooks

Without a server listbox, the listbox is generated from the `<select>`. Render hooks decide what each option and group label looks like. `data-*` attributes of each `<option>` arrive as `option.data`:

```html
<option value="DE" data-flag="🇩🇪">Germany</option>
```

```typescript
registerComboboxPlugin({
  renderOption: (option, { html }) =>
    html`<span aria-hidden="true">${option.data.flag}</span> ${option.label}`,
  renderGroup: (group) => group.label.toUpperCase(),
  renderEmpty: (query, { html }) => html`Nothing found for <strong>${query}</strong>`,
  messages: { noResults: 'Keine Treffer', toggle: 'Optionen anzeigen' },
});
```

`html` is FormLayer's auto-escaping template tag. A plain string is inserted as text, never as markup. The hooks are not used when the wrapper has a server-rendered listbox.

Change how options match with `filter`. The query is already lower-cased, trimmed and without accents:

```typescript
import { normalizeSearch } from 'formlayer-plugin-combobox';

registerComboboxPlugin({
  // Match the start of the label or the ISO code
  filter: (option, query) =>
    normalizeSearch(option.label).startsWith(query) || option.value.toLowerCase() === query,
});
```

Several configurations can live side by side under different field types:

```typescript
registerComboboxPlugin();                                         // data-field-type="combobox"
registerComboboxPlugin({ type: 'country', renderOption: flags }); // data-field-type="country"
```

## Keyboard

| Key | Closed | Open |
|-----|--------|------|
| Typing | Opens and filters | Filters |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Opens at the current value (or the first / last option) | Next / previous option, wrapping |
| <kbd>Alt</kbd> + <kbd>↓</kbd> | Opens without moving | — |
| <kbd>Alt</kbd> + <kbd>↑</kbd> | — | Chooses the highlighted option and closes |
| <kbd>Page Down</kbd> / <kbd>Page Up</kbd> | — | 10 options down / up |
| <kbd>Home</kbd> / <kbd>End</kbd> | Moves the caret | First / last option |
| <kbd>Enter</kbd> | Submits the form | Chooses the highlighted option |
| <kbd>Escape</kbd> | Restores the text of the current value | Closes and restores the text |

When the user leaves the field, text that matches an option exactly selects it; other text is replaced by the current value's label, and empty text clears the value.

## Accessibility

- The highlighted option is marked with `aria-activedescendant` and the `.is-active` class. `aria-selected="true"` marks only the chosen value.
- "No results" is announced through FormLayer's polite live region.
- Errors, `aria-invalid` and focus after a failed submit go to the visible input.
- The playground checks it with axe-core (WCAG 2.1 A/AA), and without JavaScript.

## Events

```typescript
wrapper.addEventListener('combobox:select', (event) => {
  const { value, label, group, data } = event.detail;
});
wrapper.addEventListener('combobox:open', () => { /* … */ });
wrapper.addEventListener('combobox:close', () => { /* … */ });
```

The usual field events (`formlayer:field-change`, …) fire too.

## Changing the options

Change the `<select>`'s options (or the server listbox's items) at any time, e.g. for a region select that depends on the country. The combobox notices and re-reads them.

## Styling

`formlayer-plugin-combobox/style.css` uses zero-specificity selectors and the `--fl-*` variables, so your rules win. The classes you can target:

| Class | Element |
|-------|---------|
| `.combobox` | The root, after the hidden `<select>` |
| `.combobox-input`, `.combobox-toggle` | The input and the toggle button |
| `.combobox-listbox` | The listbox |
| `.combobox-group`, `.combobox-group-label` | Groups and their labels |
| `.combobox-option` | Options; `.is-active` when highlighted, `[aria-selected="true"]` when chosen, `[aria-disabled="true"]` |
| `.combobox-no-results` | The "No results" item |
