import type { FieldState, FieldValidationResult, ValidatorRule, FieldControllerEventType, FieldControllerEventHandler, FormField } from './types';
import { SELECTORS, DEBOUNCE_MS } from './types';
import { runValidators } from './validators/index';
import { FieldEmitter } from './field-emitter';
import { FieldErrorPresenter, type FieldErrorRenderContext } from './field-error-presenter';

const NATIVE_CONSTRAINT_ATTRS = [
  'required', 'pattern', 'minlength', 'maxlength', 'min', 'max', 'step',
] as const;

export type { FieldErrorRenderContext };

export interface FieldControllerOptions {
  validate?: (value: string, rules: ValidatorRule[], defaultValidate: () => FieldValidationResult) => FieldValidationResult;
  onServerErrors?: (errors: string[], fieldName: string) => string[];
  /** CSS selector scoped to the field wrapper. Used after id-based lookups, before the default class fallback. */
  errorsSelector?: string;
  /** Resolve the errors container. Takes precedence over errorsSelector and built-in lookups. */
  findErrorsElement?: (field: FieldController) => HTMLElement | null;
  /** Render a single error message as HTML. Used by default rendering; ignored when renderErrors is set. */
  renderError?: (ctx: FieldErrorRenderContext, field: FieldController) => string;
  /** Join rendered error fragments. Default: `<br/>`. Ignored when renderErrors is set. */
  errorsSeparator?: string;
  /** Replace the entire error rendering step. When set, renderError and errorsSeparator are ignored. */
  renderErrors?: (errors: string[], field: FieldController) => void;

  [key: string]: unknown
}

export class FieldController implements FormField {
  readonly name: string;
  private readonly wrapper: HTMLElement;
  private input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  private readonly errorPresenter: FieldErrorPresenter<FieldController>;
  private readonly rules: ValidatorRule[];
  private readonly abortController = new AbortController();
  private readonly savedNativeAttrs = new Map<string, string>();
  private readonly emitter = new FieldEmitter();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: FieldState;
  private _enabled = true;
  private onChange: ((state: FieldState) => void) | null = null;
  private _serverErrors: string[] = [];
  private _serverErrorValue: string | null = null;

  private options: FieldControllerOptions = {};

  constructor(wrapper: HTMLElement, options: FieldControllerOptions={}) {
    this.wrapper = wrapper;
    this.name = wrapper.getAttribute('data-form-field') ?? '';

    const input = wrapper.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(SELECTORS.input);
    if (!input) {
      throw new Error(`[FormsModule] No input found in field "${this.name}"`);
    }
    this.input = input;

    this.options=options;

    this.errorPresenter = new FieldErrorPresenter<FieldController>(
      this.wrapper,
      () => this.input,
      this,
      this.options,
    );
    this.rules = this.parseRules();
    this.disableNativeValidation();

    this._state = {
      name: this.name,
      value: this.readValue(),
      isValid: true,
      isDirty: false,
      isTouched: false,
      errors: [],
    };

    this.bind();
  }

  getState(): FieldState {
    return { ...this._state };
  }



  get element(): HTMLElement {
    return this.wrapper;
  }

  get inputElement(): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
    return this.input;
  }

  get fieldType(): string | null {
    return this.wrapper.getAttribute('data-field-type') || null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;

    if (enabled) {
      this.wrapper.hidden = false;
      this.wrapper.removeAttribute('aria-hidden');
      this.input.disabled = false;
      this.wrapper.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(SELECTORS.input)
        .forEach((el) => { el.disabled = false; });
    } else {
      this.wrapper.hidden = true;
      this.wrapper.setAttribute('aria-hidden', 'true');
      this.input.disabled = true;
      this.wrapper.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(SELECTORS.input)
        .forEach((el) => { el.disabled = true; });
      this._state = { ...this._state, isValid: true, errors: [] };
      this.updateDOM(true, []);
    }

    this.notifyChange();
  }

  connect(onChange: (state: FieldState) => void): void {
    this.onChange = onChange;
  }

  focus(): void {
    this.inputElement.focus();
  }

  on(event: FieldControllerEventType, handler: FieldControllerEventHandler): void {
    this.emitter.on(event, handler);
  }

  once(event: FieldControllerEventType, handler: FieldControllerEventHandler): void {
    this.emitter.once(event, handler);
  }

  off(event: FieldControllerEventType, handler: FieldControllerEventHandler): void {
    this.emitter.off(event, handler);
  }

  replaceInput(newInput: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    this.input = newInput;
  }

  setValue(value: string): void {
    if (this.input instanceof HTMLInputElement || this.input instanceof HTMLTextAreaElement || this.input instanceof HTMLSelectElement) {
      this.input.value = value;
    }
    
    this._state.value = value;
    this._state.isDirty = true;
    this._state.isTouched = true;
    this.validate();
    this.notifyChange();
  }

  validate(): FieldValidationResult {
    if (!this._enabled) {
      return { isValid: true, errors: [] };
    }

    const value = this.readValue();

    if (this._serverErrors.length > 0 && value === this._serverErrorValue) {
      return { isValid: false, errors: this._serverErrors };
    }
    this._serverErrors = [];
    this._serverErrorValue = null;

    const defaultValidate = (): FieldValidationResult => {
      const extraOptions: Record<string, unknown> = {};
      if (this.input instanceof HTMLInputElement && this.input.type === 'file') {
        extraOptions['__files'] = this.input.files;
      }
      const failures = runValidators(this.rules, value, extraOptions);
      const errors = failures.map((f) => f.message);
      return { isValid: errors.length === 0, errors };
    };

    const result = this.options.validate
      ? this.options.validate(value, this.rules, defaultValidate)
      : defaultValidate();

    this._state = {
      ...this._state,
      value,
      isValid: result.isValid,
      errors: result.errors,
    };

    this.updateDOM(result.isValid, result.errors);
    return result;
  }

  setServerErrors(errors: string[]): void {
    const transformed = this.options.onServerErrors
      ? this.options.onServerErrors(errors, this.name)
      : errors;
    const isValid = transformed.length === 0;
    this._serverErrors = transformed;
    this._serverErrorValue = !isValid ? this.readValue() : null;
    this._state = {
      ...this._state,
      isValid,
      isTouched: true,
      errors: transformed,
    };
    this.updateDOM(isValid, transformed);
    this.notifyChange();
  }

  reset(): void {
    if (this.input instanceof HTMLInputElement) {
      if (this.input.type === 'checkbox' || this.input.type === 'radio') {
        this.input.checked = this.input.defaultChecked;
      } else if (this.input.type === 'file') {
        this.input.value = '';
      } else {
        this.input.value = this.input.defaultValue;
      }
    } else if (this.input instanceof HTMLSelectElement) {
      for (const opt of Array.from(this.input.options)) {
        opt.selected = opt.defaultSelected;
      }
    } else if (this.input instanceof HTMLTextAreaElement) {
      this.input.value = this.input.defaultValue;
    }

    this._serverErrors = [];
    this._serverErrorValue = null;
    this._state = {
      name: this.name,
      value: this.readValue(),
      isValid: true,
      isDirty: false,
      isTouched: false,
      errors: [],
    };
    this.updateDOM(true, []);
  }

  destroy(): void {
    this.abortController.abort();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.restoreNativeValidation();
    this.onChange = null;
    this.emitter.destroy();
  }

  private disableNativeValidation(): void {
    for (const attr of NATIVE_CONSTRAINT_ATTRS) {
      if (this.input.hasAttribute(attr)) {
        this.savedNativeAttrs.set(attr, this.input.getAttribute(attr) ?? '');
        this.input.removeAttribute(attr);
      }
    }
  }

  private restoreNativeValidation(): void {
    for (const [attr, value] of this.savedNativeAttrs) {
      if (value === '') {
        this.input.setAttribute(attr, '');
      } else {
        this.input.setAttribute(attr, value);
      }
    }
    this.savedNativeAttrs.clear();
  }

  private bind(): void {
    const signal = this.abortController.signal;

    this.input.addEventListener(
      'blur',
      () => {
        this._state.isTouched = true;
        this.validate();
        this.notifyChange();
      },
      { signal },
    );

    this.input.addEventListener(
      'input',
      () => {
        this._state.isDirty = true;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          if (this._state.isTouched) {
            this.validate();
          }
          this.notifyChange();
        }, DEBOUNCE_MS);
      },
      { signal },
    );

    this.input.addEventListener(
      'change',
      () => {
        this._state.isDirty = true;
        this._state.isTouched = true;
        this.validate();
        this.notifyChange();
      },
      { signal },
    );
  }

  private notifyChange(): void {
    this._state.value = this.readValue();
    this.emitter.emit('change', this._state, this.name);
    this.emitter.emit(this._state.isValid ? 'valid' : 'invalid', this._state, this.name);
    this.onChange?.({...this._state});
  }

  private readValue(): string {
    if (this.input instanceof HTMLSelectElement && this.input.multiple) {
      return Array.from(this.input.selectedOptions)
        .map((o) => o.value)
        .join(',');
    }

    if (this.input instanceof HTMLInputElement) {
      if (this.input.type === 'checkbox' || this.input.type === 'radio') {
        return this.readGroupValue();
      }
      if (this.input.type === 'file') {
        return this.input.files?.length ? this.input.value : '';
      }
    }

    return this.input.value;
  }

  private readGroupValue(): string {
    const inputs = this.wrapper.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
    if (inputs.length <= 1) {
      return (this.input as HTMLInputElement).checked ? (this.input as HTMLInputElement).value : '';
    }

    const values: string[] = [];
    inputs.forEach((input) => {
      if (input.checked) values.push(input.value);
    });
    return values.join(',');
  }

  private updateDOM(isValid: boolean, errors: string[]): void {
    this.errorPresenter.update(isValid, errors);
  }

  private parseRules(): ValidatorRule[] {
    const raw = this.wrapper.getAttribute('data-validate');
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as ValidatorRule[];
    } catch {
      console.warn(`[FormsModule] Invalid data-validate JSON on field "${this.name}"`);
      return [];
    }
  }
}
