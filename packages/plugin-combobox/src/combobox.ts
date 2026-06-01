import { AbstractDomFormField } from 'formlayer';

interface ComboboxOption {
  value: string;
  label: string;
}

/**
 * Accessible combobox (ARIA 1.2) built on AbstractDomFormField.
 *
 * The native <select> stays in the DOM (hidden) for form submission;
 * the visible text input + listbox handle interaction and validation UI.
 */
export default class ComboboxField extends AbstractDomFormField {
  private select!: HTMLSelectElement;
  private comboboxOptions: ComboboxOption[] = [];

  private root!: HTMLElement;
  private textInput!: HTMLInputElement;
  private listbox!: HTMLElement;
  private toggle!: HTMLButtonElement;

  private activeIndex = -1;
  private isOpen = false;
  private filteredOptions: ComboboxOption[] = [];

  protected mount(): void {
    const select = this.wrapper.querySelector('select');
    if (!select) {
      throw new Error(`[FormsModule] ComboboxField "${this.name}" requires a <select>`);
    }
    this.select = select;

    this.comboboxOptions = Array.from(select.options)
      .filter((o) => o.value !== '')
      .map((o) => ({ value: o.value, label: o.textContent?.trim() ?? o.value }));
    this.filteredOptions = [...this.comboboxOptions];

    this.buildDOM();
    this.syncFromSelect();
    this.bind();
  }

  protected readValue(): string {
    return this.select.value;
  }

  protected writeValue(value: string): void {
    this.select.value = value;
    const opt = this.comboboxOptions.find((o) => o.value === value);
    this.textInput.value = opt?.label ?? '';
    this.filteredOptions = [...this.comboboxOptions];
    this.renderOptions();
  }

  protected focusControl(): void {
    this.textInput.focus();
  }

  protected onReset(): void {
    for (const opt of Array.from(this.select.options)) {
      opt.selected = opt.defaultSelected;
    }
    this.syncFromSelect();
    this.filteredOptions = [...this.comboboxOptions];
    this.renderOptions();
    this.close();
  }

  protected onDestroy(): void {
    this.select.hidden = false;
    this.select.removeAttribute('tabindex');
    this.select.removeAttribute('aria-hidden');
    this.root?.remove();
  }

  private buildDOM(): void {
    const id = this.select.id || `cb-${this.name}`;

    this.select.hidden = true;
    this.select.setAttribute('tabindex', '-1');
    this.select.setAttribute('aria-hidden', 'true');

    this.root = document.createElement('div');
    this.root.className = 'combobox';

    this.textInput = document.createElement('input');
    this.textInput.type = 'text';
    this.textInput.id = id;
    if (this.select.id) {
      this.select.removeAttribute('id');
    }
    this.textInput.className = 'combobox-input';
    this.textInput.setAttribute('role', 'combobox');
    this.textInput.setAttribute('aria-autocomplete', 'list');
    this.textInput.setAttribute('aria-expanded', 'false');
    this.textInput.setAttribute('aria-controls', `${id}-listbox`);
    this.textInput.setAttribute('aria-haspopup', 'listbox');
    this.textInput.setAttribute('autocomplete', 'off');

    const label = this.wrapper.querySelector('label');
    if (label) {
      const labelId = label.id || `${id}-label`;
      label.id = labelId;
      this.textInput.setAttribute('aria-labelledby', labelId);
    }

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'combobox-toggle';
    this.toggle.setAttribute('aria-label', 'Toggle options');
    this.toggle.setAttribute('tabindex', '-1');
    this.toggle.innerHTML = '<svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';

    this.listbox = document.createElement('ul');
    this.listbox.id = `${id}-listbox`;
    this.listbox.className = 'combobox-listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.hidden = true;

    this.renderOptions();

    const inputWrap = document.createElement('div');
    inputWrap.className = 'combobox-input-wrap';
    inputWrap.append(this.textInput, this.toggle);

    this.root.append(inputWrap, this.listbox);
    this.select.insertAdjacentElement('afterend', this.root);

    this.setControlElement(this.textInput);
  }

  private bind(): void {
    const signal = this.signal;

    this.textInput.addEventListener('input', () => this.onInput(), { signal });
    this.textInput.addEventListener('keydown', (e) => this.onKeydown(e), { signal });
    this.textInput.addEventListener('focus', () => this.open(), { signal });
    this.textInput.addEventListener('blur', (e) => this.onBlur(e), { signal });
    this.toggle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isOpen ? this.close() : this.open();
      this.textInput.focus();
    }, { signal });
    this.listbox.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const li = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
      if (li) this.selectOption(li.dataset['value'] ?? '');
    }, { signal });
  }

  private onInput(): void {
    this.markDirty();
    const query = this.textInput.value.toLowerCase().trim();
    this.filteredOptions = query
      ? this.comboboxOptions.filter((o) => o.label.toLowerCase().includes(query))
      : [...this.comboboxOptions];
    this.activeIndex = -1;
    this.renderOptions();
    this.open();
  }

  private onKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.isOpen) { this.open(); return; }
        this.moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!this.isOpen) { this.open(); return; }
        this.moveActive(-1);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.isOpen && this.activeIndex >= 0) {
          this.selectOption(this.filteredOptions[this.activeIndex].value);
        }
        break;
      case 'Escape':
        if (this.isOpen) {
          e.preventDefault();
          this.close();
        }
        break;
      case 'Home':
        if (this.isOpen) {
          e.preventDefault();
          this.setActive(0);
        }
        break;
      case 'End':
        if (this.isOpen) {
          e.preventDefault();
          this.setActive(this.filteredOptions.length - 1);
        }
        break;
    }
  }

  private onBlur(e: FocusEvent): void {
    const related = e.relatedTarget as HTMLElement | null;
    if (this.root.contains(related)) return;
    this.close();
    this.commitInputValue();
  }

  private commitInputValue(): void {
    this.markTouched();
    const text = this.textInput.value.trim().toLowerCase();
    const match = this.comboboxOptions.find((o) => o.label.toLowerCase() === text);
    if (match) {
      this.applySelection(match);
    } else if (text === '') {
      this.setValue('');
    } else {
      const prev = this.comboboxOptions.find((o) => o.value === this.select.value);
      this.textInput.value = prev?.label ?? '';
      this.validate();
      this.notifyChange();
    }
  }

  private open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.listbox.hidden = false;
    this.textInput.setAttribute('aria-expanded', 'true');
  }

  private close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.listbox.hidden = true;
    this.textInput.setAttribute('aria-expanded', 'false');
    this.textInput.removeAttribute('aria-activedescendant');
    this.activeIndex = -1;
    this.clearActiveDescendant();
  }

  private selectOption(value: string): void {
    const opt = this.comboboxOptions.find((o) => o.value === value);
    if (!opt) return;
    this.applySelection(opt);
    this.close();
    this.textInput.focus();
  }

  private applySelection(opt: ComboboxOption): void {
    this.textInput.value = opt.label;
    this.select.value = opt.value;
    this.setValue(opt.value);
  }

  private moveActive(delta: number): void {
    const len = this.filteredOptions.length;
    if (len === 0) return;
    let next = this.activeIndex + delta;
    if (next < 0) next = len - 1;
    if (next >= len) next = 0;
    this.setActive(next);
  }

  private setActive(index: number): void {
    this.activeIndex = index;
    const items = this.listbox.querySelectorAll<HTMLElement>('[role="option"]');
    items.forEach((el, i) => {
      const active = i === index;
      el.setAttribute('aria-selected', String(active));
      if (active) {
        this.textInput.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private clearActiveDescendant(): void {
    this.listbox.querySelectorAll('[aria-selected="true"]').forEach((el) => {
      el.setAttribute('aria-selected', 'false');
    });
  }

  private renderOptions(): void {
    const selectedValue = this.select.value;
    const id = this.listbox.id;

    this.listbox.innerHTML = this.filteredOptions.length === 0
      ? '<li class="combobox-no-results" role="presentation">No results</li>'
      : this.filteredOptions
          .map((opt, i) => {
            const selected = opt.value === selectedValue;
            return `<li id="${id}-opt-${i}" role="option" aria-selected="${selected}" data-value="${this.escapeAttr(opt.value)}" class="combobox-option${selected ? ' is-selected' : ''}">${this.escapeHtml(opt.label)}</li>`;
          })
          .join('');
  }

  private syncFromSelect(): void {
    const val = this.select.value;
    const opt = this.comboboxOptions.find((o) => o.value === val);
    this.textInput.value = opt?.label ?? '';
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
