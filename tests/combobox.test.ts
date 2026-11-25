/**
 * Combobox v2 (issue #12): markup-first listbox, <optgroup> fallback, render
 * hooks, filtering, keyboard, ARIA state, destroy, dynamic options.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import ComboboxField, { createComboboxField, normalizeSearch } from '../packages/plugin-combobox/src/combobox';
import { registerComboboxPlugin } from '../packages/plugin-combobox/src/index';
import { getRegisteredFieldTypes, unregisterFieldType } from '../src/forms/field-types';
import { registerDefaultValidators } from '../src/forms/validators';
import { FormController } from '../src/forms/form-controller';

registerDefaultValidators();

const SELECT = `
  <label for="country">Country</label>
  <select id="country" name="country" aria-describedby="country-hint" required>
    <option value="">Choose a country</option>
    <optgroup label="Europe">
      <option value="AT" data-flag="🇦🇹">Österreich</option>
      <option value="DE" data-flag="🇩🇪">Germany</option>
      <option value="CH" data-flag="🇨🇭" disabled>Switzerland</option>
    </optgroup>
    <optgroup label="Americas">
      <option value="CA" data-flag="🇨🇦">Canada</option>
      <option value="US" data-flag="🇺🇸" data-search="usa united states america">United States</option>
    </optgroup>
  </select>
  <p id="country-hint">Where you live.</p>
  <p id="country-errors" class="invalid-feedback"></p>`;

const SERVER_LISTBOX = `
  <ul data-fl-part="listbox" hidden>
    <li role="group" aria-labelledby="g-eu"><span id="g-eu">Europe</span>
      <ul role="none">
        <li role="option" data-value="AT"><span aria-hidden="true">🇦🇹</span> Österreich</li>
        <li role="option" data-value="DE"><span aria-hidden="true">🇩🇪</span> Germany</li>
      </ul>
    </li>
    <li role="group" aria-labelledby="g-am"><span id="g-am">Americas</span>
      <ul role="none">
        <li role="option" data-value="CA"><span aria-hidden="true">🇨🇦</span> Canada</li>
        <li role="option" data-value="US" data-search="usa"><span aria-hidden="true">🇺🇸</span> United States</li>
      </ul>
    </li>
  </ul>`;

function mount(extra = '', attrs = ''): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-form-field', 'country');
  wrapper.setAttribute('data-field-type', 'combobox');
  wrapper.innerHTML = SELECT + extra;
  for (const [name, value] of attrs ? attrs.split(';').map((a) => a.split('=')) : []) wrapper.setAttribute(name, value);
  document.body.append(wrapper);
  return wrapper;
}

const input = (w: HTMLElement) => w.querySelector<HTMLInputElement>('[role="combobox"]')!;
const listbox = (w: HTMLElement) => w.querySelector<HTMLElement>('[role="listbox"]')!;
const visibleOptions = (w: HTMLElement) =>
  [...listbox(w).querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => !o.hidden && !o.closest('[hidden]:not([role="listbox"])'));
const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
};
const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const activeOption = (w: HTMLElement) => {
  const id = input(w).getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('generated listbox (no server markup)', () => {
  it('keeps <optgroup> groups as labelled role="group" and skips the placeholder', () => {
    const w = mount();
    new ComboboxField(w);
    const groups = listbox(w).querySelectorAll('[role="group"]');
    expect(groups).toHaveLength(2);
    const labelId = groups[0].getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)!.textContent).toBe('Europe');
    expect(listbox(w).querySelectorAll('[role="option"]')).toHaveLength(5);
    expect(input(w).placeholder).toBe('Choose a country');
    expect(listbox(w).querySelector('[data-value="CH"]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('moves the select id to the input so <label for> still labels it, and links the hint', () => {
    const w = mount();
    new ComboboxField(w);
    expect(input(w).id).toBe('country');
    expect((input(w) as HTMLInputElement).labels?.[0]?.textContent).toBe('Country');
    expect(w.querySelector('select')!.id).toBe('');
    expect(input(w).getAttribute('aria-describedby')).toBe('country-hint');
    expect(input(w).getAttribute('aria-required')).toBe('true');
    expect(listbox(w).getAttribute('aria-labelledby')).toBe(w.querySelector('label')!.id);
  });

  it('renders options and groups through renderOption / renderGroup with escaping', () => {
    const w = mount();
    const Field = createComboboxField({
      renderOption: (o, { html }) => html`<span aria-hidden="true">${o.data.flag}</span> ${o.label}`,
      renderGroup: (g) => `<${g.label}>`,
    });
    new Field(w);
    const de = listbox(w).querySelector<HTMLElement>('[data-value="DE"]')!;
    expect(de.innerHTML).toBe('<span aria-hidden="true">🇩🇪</span> Germany');
    expect(listbox(w).querySelector('.combobox-group-label')!.innerHTML).toBe('&lt;Europe&gt;');
  });
});

describe('server-rendered listbox (markup-first)', () => {
  it('uses the server markup as is, with flags and groups', () => {
    const w = mount(SERVER_LISTBOX);
    new ComboboxField(w);
    const lb = listbox(w);
    expect(lb.hasAttribute('data-fl-part')).toBe(true);
    expect(lb.querySelectorAll('[role="group"]')).toHaveLength(2);
    expect(lb.querySelector('[data-value="DE"]')!.textContent).toContain('🇩🇪');
    expect(input(w).getAttribute('aria-controls')).toBe(lb.id);
  });

  it('labels selections with the spoken text (flags excluded)', () => {
    const w = mount(SERVER_LISTBOX);
    const field = new ComboboxField(w);
    field.setValue('DE');
    expect(input(w).value).toBe('Germany');
  });

  it('puts the listbox back on destroy and restores the select', () => {
    const w = mount(SERVER_LISTBOX);
    const field = new ComboboxField(w);
    field.destroy();
    const lb = w.querySelector<HTMLElement>('[data-fl-part="listbox"]')!;
    expect(lb.parentElement).toBe(w);
    expect(lb.hidden).toBe(true);
    expect(lb.hasAttribute('role')).toBe(false);
    expect(w.querySelector('select')!.id).toBe('country');
    expect(w.querySelector('select')!.hidden).toBe(false);
    expect(w.querySelector('[role="combobox"]')).toBeNull();
  });
});

describe('filtering', () => {
  it('hides non-matching options and empty groups, ignoring case and accents', () => {
    const w = mount(SERVER_LISTBOX);
    new ComboboxField(w);
    type(input(w), 'oster');
    expect(visibleOptions(w).map((o) => o.dataset.value)).toEqual(['AT']);
    const americas = listbox(w).querySelectorAll<HTMLElement>('[role="group"]')[1];
    expect(americas.hidden).toBe(true);
    expect(listbox(w).hidden).toBe(false);
    expect(input(w).getAttribute('aria-expanded')).toBe('true');
  });

  it('treats an empty data-search as no extra terms', () => {
    const w = mount(SERVER_LISTBOX.replace('data-value="DE"', 'data-value="DE" data-search=""'));
    new ComboboxField(w);
    type(input(w), 'germ');
    expect(visibleOptions(w).map((o) => o.dataset.value)).toEqual(['DE']);
  });

  it('matches data-search', () => {
    const w = mount();
    new ComboboxField(w);
    type(input(w), 'usa');
    expect(visibleOptions(w).map((o) => o.dataset.value)).toEqual(['US']);
  });

  it('shows and announces "no results" with the configured message', async () => {
    vi.useFakeTimers();
    const w = mount('', 'data-combobox-no-results=Keine Treffer');
    new ComboboxField(w);
    type(input(w), 'zzz');
    const empty = listbox(w).querySelector<HTMLElement>('.combobox-no-results')!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('Keine Treffer');
    await vi.advanceTimersByTimeAsync(600);
    expect(document.querySelector('[data-fl-live-region]')!.textContent).toBe('Keine Treffer');
    vi.useRealTimers();
  });

  it('uses a custom filter', () => {
    const w = mount();
    const Field = createComboboxField({ filter: (o, q) => o.value.toLowerCase().startsWith(q) });
    new Field(w);
    type(input(w), 'c');
    expect(visibleOptions(w).map((o) => o.dataset.value)).toEqual(['CH', 'CA']);
  });
});

describe('keyboard and ARIA state', () => {
  it('ArrowDown opens and walks options across groups, skipping disabled ones', () => {
    const w = mount();
    new ComboboxField(w);
    key(input(w), 'ArrowDown');
    expect(input(w).getAttribute('aria-expanded')).toBe('true');
    expect(activeOption(w)!.dataset.value).toBe('AT');
    key(input(w), 'ArrowDown');
    key(input(w), 'ArrowDown');
    expect(activeOption(w)!.dataset.value).toBe('CA'); // CH is disabled, group headers aren't options
    expect(activeOption(w)!.classList.contains('is-active')).toBe(true);
  });

  it('Home, End, PageUp and PageDown move within the open list', () => {
    const w = mount();
    new ComboboxField(w);
    key(input(w), 'ArrowDown');
    key(input(w), 'End');
    expect(activeOption(w)!.dataset.value).toBe('US');
    key(input(w), 'Home');
    expect(activeOption(w)!.dataset.value).toBe('AT');
    key(input(w), 'PageDown');
    expect(activeOption(w)!.dataset.value).toBe('US'); // stops at the end
    key(input(w), 'PageUp');
    expect(activeOption(w)!.dataset.value).toBe('AT');
  });

  it('Enter selects the active option; aria-selected marks only the chosen value', () => {
    const w = mount();
    const field = new ComboboxField(w);
    const selected = vi.fn();
    w.addEventListener('combobox:select', selected);
    key(input(w), 'ArrowDown');
    key(input(w), 'ArrowDown');
    expect(listbox(w).querySelectorAll('[aria-selected="true"]')).toHaveLength(0); // highlighting isn't selecting
    key(input(w), 'Enter');
    expect(field.getState().value).toBe('DE');
    expect(w.querySelector('select')!.value).toBe('DE');
    expect(input(w).value).toBe('Germany');
    expect(input(w).getAttribute('aria-expanded')).toBe('false');
    expect(input(w).hasAttribute('aria-activedescendant')).toBe(false);
    expect([...listbox(w).querySelectorAll('[aria-selected="true"]')].map((o) => (o as HTMLElement).dataset.value)).toEqual(['DE']);
    expect((selected.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ value: 'DE', label: 'Germany', group: 'Europe' });
  });

  it('Enter on a closed list is not prevented, so the form can submit', () => {
    const w = mount();
    new ComboboxField(w);
    expect(key(input(w), 'Enter').defaultPrevented).toBe(false);
  });

  it('Escape closes and restores the text of the selected option', () => {
    const w = mount();
    const field = new ComboboxField(w);
    field.setValue('CA');
    type(input(w), 'Ger');
    key(input(w), 'Escape');
    expect(input(w).getAttribute('aria-expanded')).toBe('false');
    expect(input(w).value).toBe('Canada');
  });

  it('clicking an option selects it', () => {
    const w = mount();
    const field = new ComboboxField(w);
    input(w).click();
    listbox(w).querySelector<HTMLElement>('[data-value="US"]')!.click();
    expect(field.getState().value).toBe('US');
  });
});

describe('leaving the field', () => {
  const leave = (w: HTMLElement) => input(w).dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));

  it('accepts typed text that matches an option exactly', () => {
    const w = mount();
    const field = new ComboboxField(w);
    type(input(w), 'germany');
    leave(w);
    expect(field.getState().value).toBe('DE');
    expect(input(w).value).toBe('Germany');
  });

  it('restores the selection when the text matches nothing, and clears on empty text', () => {
    const w = mount();
    const field = new ComboboxField(w);
    field.setValue('AT');
    type(input(w), 'Atlantis');
    leave(w);
    expect(field.getState().value).toBe('AT');
    expect(input(w).value).toBe('Österreich');
    type(input(w), '');
    leave(w);
    expect(field.getState().value).toBe('');
  });

  it('shows validation errors on the visible input', async () => {
    const w = mount();
    w.setAttribute('data-validate', '[{"type":"NotEmpty","options":{"message":"Choose a country."}}]');
    const form = document.createElement('form');
    form.append(w);
    document.body.append(form);
    const ctrl = new FormController(form, async () => {}, { fieldsMap: { combobox: ComboboxField } });
    expect(await ctrl.validate()).toBe(false);
    expect(input(w).getAttribute('aria-invalid')).toBe('true');
    expect(input(w).getAttribute('aria-describedby')).toContain('country-errors');
    expect(document.activeElement).toBe(input(w));
  });
});

describe('lifecycle', () => {
  it('re-reads options when the <select> changes (dependent selects)', async () => {
    const w = mount();
    new ComboboxField(w);
    const select = w.querySelector('select')!;
    select.innerHTML = '<option value="">Choose</option><option value="BY">Bavaria</option>';
    await Promise.resolve();
    expect([...listbox(w).querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.dataset.value)).toEqual(['BY']);
  });

  it('reset() restores the initial selection; disabling disables the input', () => {
    const w = mount();
    w.querySelector<HTMLOptionElement>('option[value="CA"]')!.defaultSelected = true;
    const field = new ComboboxField(w);
    expect(input(w).value).toBe('Canada');
    field.setValue('DE');
    field.reset();
    expect(field.getState().value).toBe('CA');
    expect(input(w).value).toBe('Canada');
    field.setEnabled(false);
    expect(input(w).disabled).toBe(true);
  });
});

describe('registerComboboxPlugin()', () => {
  afterEach(() => unregisterFieldType('combobox'));

  it('accepts a type string (v1) or options', () => {
    registerComboboxPlugin('my-combobox');
    expect(getRegisteredFieldTypes()).toHaveProperty('my-combobox');
    unregisterFieldType('my-combobox');
    registerComboboxPlugin({ messages: { noResults: 'Nichts' } });
    expect(getRegisteredFieldTypes()).toHaveProperty('combobox');
  });
});

it('normalizeSearch strips accents and case', () => {
  expect(normalizeSearch('  Österreich ')).toBe('osterreich');
});
