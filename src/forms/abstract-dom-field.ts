import type {
  DomFormField,
  FieldControllerEventHandler,
  FieldControllerEventType,
  FieldState,
  FieldValidationResult,
  ValidatorRule,
} from './types';
import { FieldEmitter } from './field-emitter';
import { FieldErrorPresenter } from './field-error-presenter';
import { runValidators } from './validators/index';
import type { FieldOptions } from './field-options';

export type AbstractDomFieldOptions = FieldOptions;

export abstract class AbstractDomFormField implements DomFormField {
  readonly name: string;
  protected readonly wrapper: HTMLElement;
  protected input!: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  protected readonly rules: ValidatorRule[];
  protected readonly abortController = new AbortController();
  protected readonly emitter = new FieldEmitter();
  protected errorPresenter!: FieldErrorPresenter<this>;
  protected readonly options: AbstractDomFieldOptions;

  private _initialized = false;
  private _state!: FieldState;
  private _enabled = true;
  private onChange: ((state: FieldState) => void) | null = null;
  private _serverErrors: string[] = [];
  private _serverErrorValue: string | null = null;

  constructor(wrapper: HTMLElement, options: AbstractDomFieldOptions = {}) {
    this.wrapper = wrapper;
    this.name = wrapper.getAttribute('data-form-field') ?? '';
    this.options = options;
    this.rules = this.parseRules();
  }

  /**
   * Completes field setup: runs {@link mount}, wires error presentation, and
   * captures the initial state. Invoked by the field factories
   * (`createField` / `initField`) right after construction — once subclass
   * class fields are initialized — so the overridable {@link mount} never runs
   * mid-construction. This is internal lifecycle plumbing, not an extension
   * point: subclasses override {@link mount} et al., never this.
   */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.mount();

    if (!this.input) {
      throw new Error(`[FormsModule] No control element set in field "${this.name}"`);
    }

    this.errorPresenter = new FieldErrorPresenter(
      this.wrapper,
      () => this.input,
      this,
      this.options,
    );

    this._state = {
      name: this.name,
      value: this.readValue(),
      isValid: true,
      isDirty: false,
      isTouched: false,
      errors: [],
    };
  }

  /** Subclass hook: build custom DOM and call {@link setControlElement}. */
  protected abstract mount(): void;

  /** Subclass hook: read the canonical string value from the DOM. */
  protected abstract readValue(): string;

  /** Subclass hook: write a string value back to the DOM. */
  protected abstract writeValue(value: string): void;

  /** Subclass hook: focus the interactive control. Defaults to {@link inputElement}. */
  protected focusControl(): void {
    this.input.focus();
  }

  /** Subclass hook: restore DOM to initial values during {@link reset}. */
  protected onReset(): void {}

  /** Subclass hook: tear down custom DOM during {@link destroy}. */
  protected onDestroy(): void {}

  /** Set the active control used for focus, validation UI, and aria attributes. */
  protected setControlElement(
    element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ): void {
    this.input = element;
  }

  /** AbortSignal for event listeners; aborted in {@link destroy}. */
  protected get signal(): AbortSignal {
    return this.abortController.signal;
  }

  protected markDirty(): void {
    this._state.isDirty = true;
  }

  protected markTouched(): void {
    this._state.isTouched = true;
  }

  protected notifyChange(): void {
    this._state.value = this.readValue();
    this.emitter.emit('change', this._state, this.name);
    this.emitter.emit(this._state.isValid ? 'valid' : 'invalid', this._state, this.name);
    this.onChange?.({ ...this._state });
  }

  protected updateErrorDOM(isValid: boolean, errors: string[]): void {
    this.errorPresenter.update(isValid, errors);
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

  connect(onChange: (state: FieldState) => void): void {
    this.onChange = onChange;
  }

  focus(): void {
    this.focusControl();
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
    this.writeValue(value);
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
      const failures = runValidators(this.rules, value, {});
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

    this.updateErrorDOM(result.isValid, result.errors);
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
    this.updateErrorDOM(isValid, transformed);
    this.notifyChange();
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;

    if (enabled) {
      this.wrapper.hidden = false;
      this.wrapper.removeAttribute('aria-hidden');
      this.input.disabled = false;
    } else {
      this.wrapper.hidden = true;
      this.wrapper.setAttribute('aria-hidden', 'true');
      this.input.disabled = true;
      this._state = { ...this._state, isValid: true, errors: [] };
      this.updateErrorDOM(true, []);
    }

    this.notifyChange();
  }

  reset(): void {
    this.onReset();
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
    this.updateErrorDOM(true, []);
  }

  destroy(): void {
    this.abortController.abort();
    this.onDestroy();
    this.onChange = null;
    this.emitter.destroy();
  }

  protected parseRules(): ValidatorRule[] {
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
