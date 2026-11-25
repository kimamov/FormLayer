import { announce, defineField, html } from 'formlayer';
import type { DefinedFieldClass, FieldAdapter, FieldContext, HtmlValue } from 'formlayer';

/** An option as passed to render hooks and `filter`. */
export interface ComboboxOptionData {
  value: string;
  /** Text shown in the input once selected (`data-label`, or the option's spoken text). */
  label: string;
  disabled: boolean;
  /** `data-*` attributes of the `<option>` (generated listbox) or of the `role="option"` element. */
  data: Record<string, string>;
  /** Label of the group the option is in, if any. */
  group: string | null;
}

/** An option of the open listbox. */
export interface ComboboxOption extends ComboboxOptionData {
  element: HTMLElement;
}

export interface ComboboxGroupData {
  label: string;
  data: Record<string, string>;
}

export interface ComboboxRenderHelpers {
  /** Auto-escaping template tag from `formlayer`. */
  html: typeof html;
}

export interface ComboboxMessages {
  /** Shown (and announced) when nothing matches. Default: "No results". */
  noResults: string;
  /** Accessible name of the toggle button. Default: "Show options". */
  toggle: string;
}

export interface ComboboxOptions {
  /** Content of each generated option. Strings are escaped. Not used with a server-rendered listbox. */
  renderOption?(option: ComboboxOptionData, helpers: ComboboxRenderHelpers): HtmlValue;
  /** Content of each generated group label. Not used with a server-rendered listbox. */
  renderGroup?(group: ComboboxGroupData, helpers: ComboboxRenderHelpers): HtmlValue;
  /** Content shown when nothing matches the query. */
  renderEmpty?(query: string, helpers: ComboboxRenderHelpers): HtmlValue;
  /**
   * Whether an option matches. `query` is lower-cased, trimmed and without accents.
   * Default: the option's label plus its `data-search` terms, normalised the same way, contain the query.
   */
  filter?(option: ComboboxOption, query: string): boolean;
  messages?: Partial<ComboboxMessages>;
}

const DEFAULT_MESSAGES: ComboboxMessages = { noResults: 'No results', toggle: 'Show options' };
const PAGE_SIZE = 10;
const helpers: ComboboxRenderHelpers = { html };

let uid = 0;

/** Lower-case, trim, strip accents: "Österreich " → "osterreich". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function defaultFilter(option: ComboboxOption, query: string): boolean {
  return normalizeSearch(`${option.label} ${option.data.search ?? ''}`).includes(query);
}

/** Text as a screen reader reads it: `aria-hidden` parts removed, whitespace collapsed. */
function spokenText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function toNode(content: HtmlValue): DocumentFragment {
  return html`${content}`;
}

/**
 * Create a combobox field class with your own render hooks, filter and messages.
 * `registerComboboxPlugin(options)` does this for you.
 */
export function createComboboxField(config: ComboboxOptions = {}): DefinedFieldClass {
  return defineField({
    setup(ctx) {
      return setupCombobox(ctx, config);
    },
  });
}

function setupCombobox(ctx: FieldContext, config: ComboboxOptions): FieldAdapter {
  const { wrapper, signal } = ctx;
  const found = wrapper.querySelector('select');
  if (!found) throw new Error(`[FormLayer] Combobox "${ctx.name}" requires a <select>`);
  const select: HTMLSelectElement = found;

  const messages: ComboboxMessages = {
    ...DEFAULT_MESSAGES,
    ...config.messages,
    ...(wrapper.dataset.comboboxNoResults ? { noResults: wrapper.dataset.comboboxNoResults } : {}),
    ...(wrapper.dataset.comboboxToggle ? { toggle: wrapper.dataset.comboboxToggle } : {}),
  };
  const filter = config.filter ?? defaultFilter;

  // --- the input takes over the select's id, so <label for> keeps working -----------
  const originalId = select.id;
  const id = originalId || `fl-combobox-${++uid}`;
  select.removeAttribute('id');
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'combobox-input';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-listbox`);
  if (select.required) input.setAttribute('aria-required', 'true');
  const describedBy = select.getAttribute('aria-describedby');
  if (describedBy) input.setAttribute('aria-describedby', describedBy);
  const placeholder = Array.from(select.options).find((o) => o.value === '');
  if (placeholder?.text.trim()) input.placeholder = placeholder.text.trim();

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'combobox-toggle';
  toggle.tabIndex = -1;
  toggle.setAttribute('aria-label', messages.toggle);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${id}-listbox`);
  toggle.innerHTML = '<svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';

  // --- the listbox: server-rendered (markup-first) or generated from the <select> ---
  const serverListbox = wrapper.querySelector<HTMLElement>('[data-fl-part="listbox"]');
  const listbox = serverListbox ?? document.createElement('ul');
  const restoreServerListbox = serverListbox ? rememberPlace(serverListbox) : null;
  if (!listbox.id) listbox.id = `${id}-listbox`;
  input.setAttribute('aria-controls', listbox.id);
  toggle.setAttribute('aria-controls', listbox.id);
  listbox.setAttribute('role', 'listbox');
  listbox.classList.add('combobox-listbox');
  listbox.hidden = true;
  const label = Array.from(wrapper.querySelectorAll('label')).find((l) => l.htmlFor === id) ?? null;
  if (label) {
    label.id ||= `${id}-label`;
    listbox.setAttribute('aria-labelledby', label.id);
  }

  const empty = document.createElement('li');
  empty.className = 'combobox-no-results';
  empty.setAttribute('role', 'presentation');
  empty.hidden = true;

  const root = document.createElement('div');
  root.className = 'combobox';
  const inputWrap = document.createElement('div');
  inputWrap.className = 'combobox-input-wrap';
  inputWrap.append(input, toggle);
  root.append(inputWrap, listbox);
  select.after(root);

  let options: ComboboxOption[] = [];
  let active: ComboboxOption | null = null;
  let isOpen = false;
  let lastQuery = '';

  function buildFromSelect(): void {
    listbox.replaceChildren();
    let groupIndex = 0;
    const optionItem = (option: HTMLOptionElement, group: string | null): HTMLLIElement => {
      const data: ComboboxOptionData = {
        value: option.value,
        label: option.label.trim() || option.text.trim(),
        disabled: option.disabled,
        data: { ...option.dataset } as Record<string, string>,
        group,
      };
      const li = document.createElement('li');
      li.dataset.value = option.value;
      li.dataset.label = data.label;
      if (data.data.search) li.dataset.search = data.data.search;
      if (data.disabled) li.setAttribute('aria-disabled', 'true');
      li.setAttribute('role', 'option');
      li.append(toNode(config.renderOption ? config.renderOption(data, helpers) : data.label));
      return li;
    };
    for (const child of Array.from(select.children)) {
      if (child instanceof HTMLOptionElement && child.value !== '') {
        listbox.append(optionItem(child, null));
      } else if (child instanceof HTMLOptGroupElement) {
        const groupLabel = child.label;
        const groupId = `${listbox.id}-group-${++groupIndex}`;
        const group = document.createElement('li');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', groupId);
        const heading = document.createElement('span');
        heading.id = groupId;
        heading.className = 'combobox-group-label';
        heading.append(toNode(config.renderGroup
          ? config.renderGroup({ label: groupLabel, data: { ...child.dataset } as Record<string, string> }, helpers)
          : groupLabel));
        const list = document.createElement('ul');
        list.setAttribute('role', 'none');
        for (const option of Array.from(child.children)) {
          if (option instanceof HTMLOptionElement && option.value !== '') list.append(optionItem(option, groupLabel));
        }
        group.append(heading, list);
        listbox.append(group);
      }
    }
  }

  function groupLabelOf(element: HTMLElement): string | null {
    const group = element.parentElement?.closest<HTMLElement>('[role="group"]');
    if (!group || !listbox.contains(group)) return null;
    const labelledBy = group.getAttribute('aria-labelledby');
    const heading = labelledBy
      ? Array.from(group.querySelectorAll('[id]')).find((el) => el.id === labelledBy) ?? document.getElementById(labelledBy)
      : null;
    return heading ? spokenText(heading) : group.getAttribute('aria-label');
  }

  /** Read the options from the listbox DOM (both modes end up here). */
  function index(): void {
    if (!empty.isConnected) listbox.append(empty);
    const known = new Set(Array.from(select.options).map((o) => o.value));
    options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]')).map((element, i) => {
      element.id ||= `${listbox.id}-${i}`;
      element.classList.add('combobox-option');
      const value = element.dataset.value ?? '';
      if (!known.has(value)) console.warn(`[FormLayer] Combobox "${ctx.name}": option "${value}" has no matching <option> in the <select>`);
      return {
        value,
        label: element.dataset.label ?? spokenText(element),
        disabled: element.getAttribute('aria-disabled') === 'true',
        data: { ...element.dataset } as Record<string, string>,
        group: groupLabelOf(element),
        element,
      };
    });
    listbox.querySelectorAll('[role="group"]').forEach((group) => group.classList.add('combobox-group'));
    markSelected();
  }

  function current(): ComboboxOption | undefined {
    return options.find((o) => o.value === select.value);
  }

  function markSelected(): void {
    for (const option of options) {
      const selected = option.value !== '' && option.value === select.value;
      option.element.setAttribute('aria-selected', String(selected));
      option.element.classList.toggle('is-selected', selected);
    }
  }

  function syncInput(): void {
    input.value = current()?.label ?? '';
    markSelected();
  }

  function applyFilter(query: string): void {
    const q = normalizeSearch(query);
    let visible = 0;
    for (const option of options) {
      const show = q === '' || filter(option, q);
      option.element.hidden = !show;
      if (show) visible++;
    }
    listbox.querySelectorAll<HTMLElement>('[role="group"]').forEach((group) => {
      group.hidden = !group.querySelector('[role="option"]:not([hidden])');
    });
    const nothing = visible === 0;
    empty.replaceChildren(toNode(config.renderEmpty ? config.renderEmpty(query, helpers) : messages.noResults));
    empty.hidden = !nothing;
    if (nothing && q !== '' && lastQuery !== q) announce(spokenText(empty), listbox);
    lastQuery = nothing ? q : '';
    if (active?.element.hidden) setActive(null);
  }

  function navigable(): ComboboxOption[] {
    return options.filter((o) => !o.element.hidden && !o.disabled);
  }

  function setActive(option: ComboboxOption | null): void {
    active?.element.classList.remove('is-active');
    active = option;
    if (option) {
      option.element.classList.add('is-active');
      input.setAttribute('aria-activedescendant', option.element.id);
      option.element.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function move(to: 'first' | 'last' | number): void {
    const list = navigable();
    if (list.length === 0) return;
    const at = active ? list.indexOf(active) : -1;
    let next: number;
    if (to === 'first') next = 0;
    else if (to === 'last') next = list.length - 1;
    else if (at === -1) next = to > 0 ? 0 : list.length - 1;
    else if (Math.abs(to) === 1) next = (at + to + list.length) % list.length; // arrows wrap
    else next = Math.min(list.length - 1, Math.max(0, at + to)); // pages stop at the ends
    setActive(list[next]);
  }

  function open(showAll: boolean): void {
    if (input.disabled) return;
    if (showAll) applyFilter('');
    if (isOpen) return;
    isOpen = true;
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    ctx.emit('combobox:open');
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    setActive(null);
    ctx.emit('combobox:close');
  }

  function choose(option: ComboboxOption): void {
    if (option.disabled) return;
    const changed = select.value !== option.value;
    select.value = option.value;
    syncInput();
    close();
    if (changed) {
      ctx.commit();
      const { element: _element, ...data } = option;
      ctx.emit('combobox:select', data);
    }
  }

  /** Leaving the field: accept typed text that matches an option exactly, else restore. */
  function commitText(): void {
    const text = normalizeSearch(input.value);
    if (text === '') {
      if (select.value !== '') {
        select.value = '';
        syncInput();
        ctx.commit();
      }
      return;
    }
    const match = options.find((o) => !o.disabled && normalizeSearch(o.label) === text);
    if (match && match.value !== select.value) {
      select.value = match.value;
      syncInput();
      ctx.commit();
    } else {
      syncInput();
    }
  }

  // --- events --------------------------------------------------------------------
  input.addEventListener('input', () => {
    applyFilter(input.value);
    open(false);
    setActive(null);
    ctx.input();
  }, { signal });

  input.addEventListener('click', () => (isOpen ? null : open(true)), { signal });

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const down = event.key === 'ArrowDown';
        if (!isOpen) {
          open(true);
          if (event.altKey) return;
          const selected = current();
          if (selected && !selected.element.hidden) setActive(selected);
          else move(down ? 'first' : 'last');
          return;
        }
        if (event.altKey && !down) {
          if (active) choose(active);
          else close();
          return;
        }
        move(down ? 1 : -1);
        return;
      }
      case 'PageDown':
      case 'PageUp':
        if (!isOpen) return;
        event.preventDefault();
        move(event.key === 'PageDown' ? PAGE_SIZE : -PAGE_SIZE);
        return;
      case 'Home':
      case 'End':
        if (!isOpen) return; // closed: move the caret as usual
        event.preventDefault();
        move(event.key === 'Home' ? 'first' : 'last');
        return;
      case 'Enter':
        if (!isOpen) return; // closed: Enter submits the form as usual
        event.preventDefault();
        if (active) choose(active);
        else close();
        return;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          close();
          syncInput();
        } else if (input.value !== '') {
          event.preventDefault();
          syncInput();
        }
        return;
    }
  }, { signal });

  root.addEventListener('focusout', (event) => {
    if (root.contains(event.relatedTarget as Node | null)) return;
    close();
    commitText();
    ctx.touch();
  }, { signal });

  // Keep focus in the input when clicking the toggle or an option.
  toggle.addEventListener('pointerdown', (event) => event.preventDefault(), { signal });
  listbox.addEventListener('pointerdown', (event) => event.preventDefault(), { signal });
  toggle.addEventListener('click', () => {
    if (isOpen) close();
    else open(true);
    input.focus();
  }, { signal });
  listbox.addEventListener('click', (event) => {
    const element = (event.target as Element).closest<HTMLElement>('[role="option"]');
    const option = options.find((o) => o.element === element);
    if (option) {
      choose(option);
      input.focus();
    }
  }, { signal });

  // Options changed later (e.g. a dependent select): re-read them.
  const observer = new MutationObserver((records) => {
    if (records.every((r) => empty.contains(r.target))) return;
    if (!serverListbox) buildFromSelect();
    index();
    applyFilter(isOpen ? input.value : '');
    syncInput();
  });

  if (!serverListbox) buildFromSelect();
  index();
  applyFilter('');
  syncInput();
  observer.observe(serverListbox ?? select, { childList: true, subtree: true });
  ctx.setControl(input);

  return {
    read: () => select.value,
    write(value) {
      select.value = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
      syncInput();
    },
    focus: () => input.focus(),
    reset() {
      for (const option of Array.from(select.options)) option.selected = option.defaultSelected;
      close();
      applyFilter('');
      syncInput();
    },
    disabled(disabled) {
      input.disabled = disabled;
      toggle.disabled = disabled;
      if (disabled) close();
    },
    destroy() {
      observer.disconnect();
      close();
      select.hidden = false;
      select.removeAttribute('tabindex');
      select.removeAttribute('aria-hidden');
      if (originalId) select.id = originalId;
      if (restoreServerListbox) {
        empty.remove();
        restoreServerListbox();
      }
      root.remove();
    },
  };
}

/** Remember where a server-rendered listbox was and what it looked like, to put it back on destroy. */
function rememberPlace(element: HTMLElement): () => void {
  const parent = element.parentNode;
  const next = element.nextSibling;
  const attrs = ['id', 'role', 'class', 'hidden', 'aria-labelledby'].map((name) => [name, element.getAttribute(name)] as const);
  return () => {
    for (const [name, value] of attrs) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
    element.querySelectorAll<HTMLElement>('[role="option"], [role="group"]').forEach((node) => {
      node.hidden = false;
      node.classList.remove('is-active', 'is-selected', 'combobox-option', 'combobox-group');
      node.removeAttribute('aria-selected');
    });
    parent?.insertBefore(element, next);
  };
}

/**
 * Accessible combobox (ARIA 1.2 editable combobox with list autocomplete).
 *
 * The native `<select>` stays in the form, hidden, and holds the submitted value.
 * Uses a server-rendered `[data-fl-part="listbox"]` when the wrapper has one,
 * otherwise generates the listbox from the `<select>` (including `<optgroup>`).
 */
const ComboboxField: DefinedFieldClass = createComboboxField();
export default ComboboxField;
