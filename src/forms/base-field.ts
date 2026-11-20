import type {
  DomFormField,
  FormField,
  FieldControllerEventHandler,
  FieldControllerEventType,
  FieldState,
  FieldValidationResult,
  ValidatorRule,
} from './types';
import { DEBOUNCE_MS, SELECTORS } from './types';
import type { FieldOptions } from './field-options';
import { FieldEmitter } from './field-emitter';
import { FieldErrorPresenter } from './field-error-presenter';
import { runValidators } from './validators/index';
import { type FieldValue, isFileValue, valueKey } from './field-value';

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** What a field definition returns from `setup()`: how to read and write its value. */
export interface FieldAdapter {
  /** Read the current value from the DOM. */
  read(): FieldValue;
  /** Write a value to the DOM (used by `setValue()` and, without `reset`, by `reset()`). */
  write(value: FieldValue): void;
  /** Move focus to the field. Default: the first control. */
  focus?(): void;
  /** Restore the initial DOM state. Default: `write()` the value read at setup. */
  reset?(): void;
  /** Called after the field was enabled or disabled (its controls are toggled already). */
  disabled?(disabled: boolean): void;
  /** Tear down DOM the field created. Listeners on `ctx.signal` are removed automatically. */
  destroy?(): void;
}

/** Passed to `setup()`: the field's wrapper, helpers and the three user-interaction signals. */
export interface FieldContext {
  /** The `[data-form-field]` wrapper. */
  readonly wrapper: HTMLElement;
  /** The field name (`data-form-field`). */
  readonly name: string;
  /** Aborted when the field is destroyed. Pass it to every `addEventListener`. */
  readonly signal: AbortSignal;
  /** Field options (`validate`, error rendering hooks, …) for custom setups. */
  readonly options: FieldOptions;
  /** The element marked `data-fl-part="<name>"` inside the wrapper. Throws if it is missing. */
  part<T extends HTMLElement = HTMLElement>(name: string): T;
  /** All elements marked `data-fl-part="<name>"` inside the wrapper. */
  parts<T extends HTMLElement = HTMLElement>(name: string): T[];
  /** The first `input`, `select` or `textarea` in the wrapper. Throws if there is none. */
  control<T extends FormControl = FormControl>(): T;
  /** All `input`, `select` and `textarea` elements in the wrapper. */
  controls(): FormControl[];
  /**
   * The element(s) that receive focus, `aria-invalid` and the error link.
   * Default: the first control. Pass every option of a group.
   */
  setControl(element: HTMLElement | HTMLElement[]): void;
  /** The user is editing (typing): marks the field dirty; validates after a pause once touched. */
  input(): void;
  /** The user committed a value (selected, ticked, picked): marks it dirty and touched and validates. */
  commit(): void;
  /** The user left the field: marks it touched and validates. */
  touch(): void;
}

/**
 * The single field implementation behind every field type: state, validation,
 * server errors, enable/disable, error presentation and events. Field types
 * only provide a {@link FieldAdapter} (see `defineField()`).
 */
export abstract class BaseField implements DomFormField {
  readonly name: string;
  protected readonly wrapper: HTMLElement;
  protected readonly options: FieldOptions;
  protected readonly rules: ValidatorRule[];
  protected readonly abortController = new AbortController();
  protected readonly emitter = new FieldEmitter();

  private adapter!: FieldAdapter;
  private presenter!: FieldErrorPresenter<FormField>;
  private targets: HTMLElement[] = [];
  private _state!: FieldState;
  private _enabled = true;
  private _initialized = false;
  private initialValue: FieldValue = '';
  private onChange: ((state: FieldState) => void) | null = null;
  private serverErrors: string[] = [];
  private serverErrorKey: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly disabledByField = new Set<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>();

  constructor(wrapper: HTMLElement, options: FieldOptions = {}) {
    this.wrapper = wrapper;
    this.name = wrapper.getAttribute('data-form-field') ?? '';
    this.options = options;
    this.rules = this.parseRules();
  }

  /** Field-type hook: build the adapter. Called once, from {@link init}. */
  protected abstract createAdapter(ctx: FieldContext): FieldAdapter;

  /**
   * Completes setup: runs {@link createAdapter}, wires error presentation and
   * captures the initial state. Idempotent. Field classes from `defineField()`
   * and the native field call it from their constructor; the field factories
   * call it for legacy `AbstractDomFormField` subclasses.
   */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.adapter = this.createAdapter(this.createContext());

    if (this.targets.length === 0) {
      const first = this.wrapper.querySelector<HTMLElement>(SELECTORS.input);
      if (!first) {
        throw new Error(`[FormLayer] No control element in field "${this.name}"`);
      }
      this.targets = [first];
    }

    this.presenter = new FieldErrorPresenter<FormField>(this.wrapper, () => this.targets, this, this.options);
    this.initialValue = this.adapter.read();
    this._state = this.freshState(this.initialValue);
  }

  // -------------------------------------------------------------------------
  // public API (FormField / DomFormField)
  // -------------------------------------------------------------------------

  getState(): FieldState {
    return { ...this._state };
  }

  get element(): HTMLElement {
    return this.wrapper;
  }

  get inputElement(): HTMLElement {
    return this.targets[0];
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
    if (this.adapter.focus) this.adapter.focus();
    else this.targets[0]?.focus();
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

  replaceInput(newInput: HTMLElement): void {
    this.targets = [newInput];
  }

  setValue(value: FieldValue): void {
    this.adapter.write(value);
    this._state.isDirty = true;
    this._state.isTouched = true;
    this.validate();
    this.notifyChange();
  }

  validate(): FieldValidationResult {
    if (!this._enabled) {
      return { isValid: true, errors: [] };
    }

    const value = this.adapter.read();

    if (this.serverErrors.length > 0 && valueKey(value) === this.serverErrorKey) {
      return { isValid: false, errors: this.serverErrors };
    }
    this.serverErrors = [];
    this.serverErrorKey = null;

    const defaultValidate = (): FieldValidationResult => {
      const extraOptions: Record<string, unknown> = {};
      const control = this.targets[0];
      if (isFileValue(value)) {
        extraOptions['__files'] = value;
      } else if (control instanceof HTMLInputElement && control.type === 'file') {
        // Custom fields that report a file input's value as a string still get its files.
        extraOptions['__files'] = control.files;
      }
      const errors = runValidators(this.rules, value, extraOptions).map((f) => f.message);
      return { isValid: errors.length === 0, errors };
    };

    const result = this.options.validate
      ? this.options.validate(value, this.rules, defaultValidate)
      : defaultValidate();

    this._state = { ...this._state, value, isValid: result.isValid, errors: result.errors };
    this.presenter.update(result.isValid, result.errors);
    return result;
  }

  setServerErrors(errors: string[]): void {
    const transformed = this.options.onServerErrors
      ? this.options.onServerErrors(errors, this.name)
      : errors;
    const isValid = transformed.length === 0;
    this.serverErrors = transformed;
    this.serverErrorKey = isValid ? null : valueKey(this.adapter.read());
    this._state = { ...this._state, isValid, isTouched: true, errors: transformed };
    this.presenter.update(isValid, transformed);
    this.notifyChange();
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;

    if (enabled) {
      this.wrapper.hidden = false;
      this.wrapper.removeAttribute('aria-hidden');
      for (const el of this.disabledByField) el.disabled = false;
      this.disabledByField.clear();
    } else {
      this.wrapper.hidden = true;
      this.wrapper.setAttribute('aria-hidden', 'true');
      // Only disable controls that were enabled, so re-enabling restores the original state.
      const controls = this.wrapper.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
        'input, select, textarea, button',
      );
      for (const el of controls) {
        if (!el.disabled) {
          el.disabled = true;
          this.disabledByField.add(el);
        }
      }
      this._state = { ...this._state, isValid: true, errors: [] };
      this.presenter.update(true, []);
    }

    this.adapter.disabled?.(!enabled);
    this.notifyChange();
  }

  reset(): void {
    if (this.adapter.reset) this.adapter.reset();
    else this.adapter.write(this.initialValue);

    this.clearDebounce();
    this.serverErrors = [];
    this.serverErrorKey = null;
    this._state = this.freshState(this.adapter.read());
    this.presenter.update(true, []);
  }

  destroy(): void {
    this.abortController.abort();
    this.clearDebounce();
    this.adapter?.destroy?.();
    this.onChange = null;
    this.emitter.destroy();
  }

  // -------------------------------------------------------------------------
  // protected helpers (also used by the legacy AbstractDomFormField shim)
  // -------------------------------------------------------------------------

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
    this._state.value = this.adapter.read();
    this.emitter.emit('change', this._state, this.name);
    this.emitter.emit(this._state.isValid ? 'valid' : 'invalid', this._state, this.name);
    this.onChange?.({ ...this._state });
  }

  protected updateErrorDOM(isValid: boolean, errors: string[]): void {
    this.presenter.update(isValid, errors);
  }

  protected setControlTargets(element: HTMLElement | HTMLElement[]): void {
    this.targets = Array.isArray(element) ? [...element] : [element];
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private createContext(): FieldContext {
    const wrapper = this.wrapper;
    const name = this.name;
    const controls = () => Array.from(wrapper.querySelectorAll<FormControl>(SELECTORS.input));

    return {
      wrapper,
      name,
      signal: this.signal,
      options: this.options,
      part: <T extends HTMLElement = HTMLElement>(part: string): T => {
        const el = wrapper.querySelector<T>(`[data-fl-part="${part}"]`);
        if (!el) throw new Error(`[FormLayer] Field "${name}" has no element with data-fl-part="${part}"`);
        return el;
      },
      parts: <T extends HTMLElement = HTMLElement>(part: string): T[] =>
        Array.from(wrapper.querySelectorAll<T>(`[data-fl-part="${part}"]`)),
      control: <T extends FormControl = FormControl>(): T => {
        const el = controls()[0];
        if (!el) throw new Error(`[FormLayer] No input found in field "${name}"`);
        return el as T;
      },
      controls,
      setControl: (element) => this.setControlTargets(element),
      input: () => this.handleInput(),
      commit: () => this.handleCommit(),
      touch: () => this.handleTouch(),
    };
  }

  private handleInput(): void {
    this._state.isDirty = true;
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this._state.isTouched) this.validate();
      this.notifyChange();
    }, DEBOUNCE_MS);
  }

  private handleCommit(): void {
    this.clearDebounce();
    this._state.isDirty = true;
    this._state.isTouched = true;
    this.validate();
    this.notifyChange();
  }

  private handleTouch(): void {
    this.clearDebounce();
    this._state.isTouched = true;
    this.validate();
    this.notifyChange();
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private freshState(value: FieldValue): FieldState {
    return { name: this.name, value, isValid: true, isDirty: false, isTouched: false, errors: [] };
  }

  private parseRules(): ValidatorRule[] {
    const raw = this.wrapper.getAttribute('data-validate');
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as ValidatorRule[];
    } catch {
      console.warn(`[FormLayer] Invalid data-validate JSON on field "${this.name}"`);
      return [];
    }
  }
}
