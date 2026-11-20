import { BaseField, type FieldAdapter, type FieldContext, type FormControl } from './base-field';
import type { FieldOptions } from './field-options';
import type { FieldValue } from './field-value';
import { valueToList } from './field-value';
import { SELECTORS } from './types';

const NATIVE_CONSTRAINT_ATTRS = [
  'required', 'pattern', 'minlength', 'maxlength', 'min', 'max', 'step',
] as const;

type Kind = 'text' | 'checkbox' | 'checkbox-group' | 'radio' | 'multi-select' | 'file';

function kindOf(controls: FormControl[]): Kind {
  const first = controls[0];
  if (first instanceof HTMLSelectElement) return first.multiple ? 'multi-select' : 'text';
  if (first instanceof HTMLInputElement) {
    if (first.type === 'radio') return 'radio';
    if (first.type === 'file') return 'file';
    if (first.type === 'checkbox') {
      const boxes = controls.filter((c) => c instanceof HTMLInputElement && c.type === 'checkbox');
      return boxes.length > 1 || first.name.endsWith('[]') ? 'checkbox-group' : 'checkbox';
    }
  }
  return 'text';
}

/**
 * The default field for native controls: text-like inputs, textareas, selects
 * (single and multiple), single checkboxes, checkbox groups, radio groups and
 * file inputs.
 *
 * Values: `string` for most controls, `string[]` for checkbox groups and
 * multi-selects, `File[]` for file inputs.
 */
export class NativeField extends BaseField {
  private readonly savedNativeAttrs = new Map<string, string>();
  private addedAriaRequiredOn: HTMLElement | null = null;

  constructor(wrapper: HTMLElement, options: FieldOptions = {}) {
    super(wrapper, options);
    this.init();
  }

  protected createAdapter(ctx: FieldContext): FieldAdapter {
    const controls = ctx.controls();
    if (controls.length === 0) {
      throw new Error(`[FormLayer] No input found in field "${this.name}"`);
    }
    const first = controls[0];
    const kind = kindOf(controls);
    const options = (): HTMLInputElement[] =>
      Array.from(this.wrapper.querySelectorAll<HTMLInputElement>(
        kind === 'radio' ? 'input[type="radio"]' : 'input[type="checkbox"]',
      ));

    // Groups link their error to every option, so it is announced whichever one has focus.
    ctx.setControl(kind === 'radio' || kind === 'checkbox-group' ? options() : first);
    this.disableNativeValidation(first);
    this.bind(ctx);

    const read = (): FieldValue => {
      switch (kind) {
        case 'radio':
          return options().find((o) => o.checked)?.value ?? '';
        case 'checkbox': {
          const box = first as HTMLInputElement;
          return box.checked ? box.value : '';
        }
        case 'checkbox-group':
          return options().filter((o) => o.checked).map((o) => o.value);
        case 'multi-select':
          return Array.from((first as HTMLSelectElement).selectedOptions).map((o) => o.value);
        case 'file':
          return Array.from((first as HTMLInputElement).files ?? []);
        default:
          return first.value;
      }
    };

    const write = (value: FieldValue): void => {
      const list = valueToList(value).map((v) => (typeof v === 'string' ? v : v.name));
      switch (kind) {
        case 'radio':
          for (const o of options()) o.checked = o.value === list[0];
          break;
        case 'checkbox': {
          const box = first as HTMLInputElement;
          box.checked = list.length > 0 && (list[0] === box.value || list[0] === 'true' || list[0] === '1');
          break;
        }
        case 'checkbox-group':
          for (const o of options()) o.checked = list.includes(o.value);
          break;
        case 'multi-select':
          for (const o of Array.from((first as HTMLSelectElement).options)) o.selected = list.includes(o.value);
          break;
        case 'file':
          // Browsers only allow clearing a file input from script.
          if (list.length === 0) (first as HTMLInputElement).value = '';
          break;
        default:
          first.value = list.join(',');
      }
    };

    const reset = (): void => {
      for (const control of controls) {
        if (control instanceof HTMLSelectElement) {
          for (const o of Array.from(control.options)) o.selected = o.defaultSelected;
        } else if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
          control.checked = control.defaultChecked;
        } else if (control instanceof HTMLInputElement && control.type === 'file') {
          control.value = '';
        } else {
          control.value = control.defaultValue;
        }
      }
    };

    const focus = (): void => {
      if (kind === 'radio') {
        (options().find((o) => o.checked) ?? first).focus();
      } else {
        first.focus();
      }
    };

    return {
      read,
      write,
      reset,
      focus,
      destroy: () => this.restoreNativeValidation(first),
    };
  }

  /**
   * Listeners sit on the wrapper so every control of a group is observed. They
   * use the capture phase, so non-bubbling events (`blur`, and synthetic
   * `new Event('change')` dispatched by integrator code) are seen too. Moving
   * focus between controls of the same field doesn't count as leaving it.
   */
  private bind(ctx: FieldContext): void {
    const wrapper = this.wrapper;
    const isOwnControl = (target: EventTarget | null): boolean =>
      target instanceof Element && target.matches(SELECTORS.input) && wrapper.contains(target);
    const opts = { signal: ctx.signal, capture: true };

    wrapper.addEventListener('blur', (event) => {
      if (!isOwnControl(event.target)) return;
      const next = (event as FocusEvent).relatedTarget;
      if (isOwnControl(next)) return;
      ctx.touch();
    }, opts);

    wrapper.addEventListener('input', (event) => {
      if (isOwnControl(event.target)) ctx.input();
    }, opts);

    wrapper.addEventListener('change', (event) => {
      if (isOwnControl(event.target)) ctx.commit();
    }, opts);
  }

  /**
   * Inside a form with `novalidate` (set by FormController) native constraints
   * never block submission or show browser bubbles, so they are kept: `required`
   * stays exposed to assistive technology. Standalone fields in a validating
   * form have the constraints removed; `required` is then mirrored as
   * `aria-required="true"`.
   */
  private disableNativeValidation(control: FormControl): void {
    if (control.form?.noValidate) return;

    for (const attr of NATIVE_CONSTRAINT_ATTRS) {
      if (control.hasAttribute(attr)) {
        this.savedNativeAttrs.set(attr, control.getAttribute(attr) ?? '');
        control.removeAttribute(attr);
      }
    }
    if (this.savedNativeAttrs.has('required') && !control.hasAttribute('aria-required')) {
      control.setAttribute('aria-required', 'true');
      this.addedAriaRequiredOn = control;
    }
  }

  private restoreNativeValidation(control: FormControl): void {
    if (this.addedAriaRequiredOn) {
      this.addedAriaRequiredOn.removeAttribute('aria-required');
      this.addedAriaRequiredOn = null;
    }
    for (const [attr, value] of this.savedNativeAttrs) {
      control.setAttribute(attr, value);
    }
    this.savedNativeAttrs.clear();
  }
}
