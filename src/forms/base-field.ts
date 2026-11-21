import type {
  DomFormField,
  FieldFormContext,
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
import { getValidator } from './validators/index';
import { runRules, ruleDependencies, type ValidatorContext } from './validation';
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
  /**
   * The user is editing (typing): marks the field dirty. After a short pause it
   * re-validates while errors are shown (so they clear once fixed), or always
   * with `data-validate-on="change"`.
   */
  input(): void;
  /** The user committed a value (selected, ticked, picked): marks it dirty and touched and validates. */
  commit(): void;
  /** The user left the field: marks it touched and validates if it was edited. */
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
  private form: FieldFormContext | null = null;
  private validationRun = 0;
  private validationAbort: AbortController | null = null;
  private lastValidatedKey: string | null = null;
  private readonly _dependencies: readonly string[];
  private readonly disabledByField = new Set<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>();

  constructor(wrapper: HTMLElement, options: FieldOptions = {}) {
    this.wrapper = wrapper;
    this.name = wrapper.getAttribute('data-form-field') ?? '';
    this.options = options;
    this.rules = this.parseRules();
    this._dependencies = ruleDependencies(this.rules);
  }

  /** Names of other fields this field's rules refer to (`options.field` / `options.fields`). */
  get dependencies(): readonly string[] {
    return this._dependencies;
  }

  /** `data-validate-on` on the wrapper, else the `validateOn` option, else `blur`. */
  private get trigger(): 'blur' | 'change' | 'submit' {
    const attr = this.wrapper.getAttribute('data-validate-on');
    if (attr === 'blur' || attr === 'change' || attr === 'submit') return attr;
    return this.options.validateOn ?? 'blur';
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

  /** A snapshot of the field state. `value` is read from the DOM, so it is never stale mid-typing. */
  getState(): FieldState {
    return { ...this._state, value: this.adapter.read() };
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

  connect(onChange: (state: FieldState) => void, form?: FieldFormContext): void {
    this.onChange = onChange;
    this.form = form ?? null;
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
    void this.validate();
    this.notifyChange();
  }

  /**
   * Run the field's rules and update its state and error UI. Synchronous rules
   * apply at once; async rules set `isValidating` and update the field (and
   * notify the form) when they settle. Starting a new run aborts the previous
   * one, and stale results are ignored.
   */
  validate(): Promise<FieldValidationResult> {
    this.validationAbort?.abort();
    this.validationAbort = null;
    const run = ++this.validationRun;

    if (!this._enabled) {
      return Promise.resolve({ isValid: true, errors: [] });
    }

    const value = this.adapter.read();
    const key = valueKey(value);
    this.lastValidatedKey = key;

    if (this.serverErrors.length > 0 && key === this.serverErrorKey) {
      return Promise.resolve({ isValid: false, errors: this.serverErrors });
    }
    this.serverErrors = [];
    this.serverErrorKey = null;

    const abort = new AbortController();
    this.validationAbort = abort;

    const defaultValidate = (): FieldValidationResult | Promise<FieldValidationResult> => {
      const { errors, pending } = runRules(this.rules, value, this.validatorContext(value, abort.signal), {
        validators: this.options.validators,
        messages: this.options.messages,
        getValidator,
      });
      if (!pending) return { isValid: errors.length === 0, errors };
      // Show synchronous errors right away while async rules run.
      this.applyResult(value, { isValid: errors.length === 0, errors }, true);
      return pending.then((all) => ({ isValid: all.length === 0, errors: all }));
    };

    const outcome = this.options.validate
      ? this.options.validate(value, this.rules, defaultValidate)
      : defaultValidate();

    if (!(outcome instanceof Promise)) {
      this.applyResult(value, outcome, false);
      return Promise.resolve(outcome);
    }

    if (!this._state.isValidating) this.applyResult(value, this._state, true);
    return outcome.then((result) => {
      if (run !== this.validationRun) return result; // a newer run owns the state
      this.validationAbort = null;
      this.applyResult(value, result, false);
      this.notifyChange();
      return result;
    });
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
      this.validationAbort?.abort();
      this.validationRun++;
      this._state = { ...this._state, isValid: true, errors: [], isValidating: false };
      this.presenter.update(true, []);
    }

    this.adapter.disabled?.(!enabled);
    this.notifyChange();
  }

  reset(): void {
    if (this.adapter.reset) this.adapter.reset();
    else this.adapter.write(this.initialValue);

    this.clearDebounce();
    this.validationAbort?.abort();
    this.validationRun++;
    this.lastValidatedKey = null;
    this.serverErrors = [];
    this.serverErrorKey = null;
    this._state = this.freshState(this.adapter.read());
    this.presenter.update(true, []);
  }

  destroy(): void {
    this.abortController.abort();
    this.validationAbort?.abort();
    this.validationRun++;
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

  private applyResult(value: FieldValue, result: FieldValidationResult, isValidating: boolean): void {
    this._state = { ...this._state, value, isValid: result.isValid, errors: result.errors, isValidating };
    this.presenter.update(result.isValid, result.errors);
  }

  private validatorContext(value: FieldValue, signal: AbortSignal): Omit<ValidatorContext, 'rule'> {
    const control = this.targets[0];
    let files: File[] = [];
    if (isFileValue(value)) {
      files = value;
    } else if (control instanceof HTMLInputElement && control.type === 'file') {
      // Custom fields that report a file input's value as a string still expose its files.
      files = Array.from(control.files ?? []);
    }
    const form = this.form;
    return {
      field: { name: this.name, element: this.wrapper },
      form: { getValue: (name) => (name === this.name ? value : form?.getValue(name)) },
      files,
      signal,
    };
  }

  private get showsErrors(): boolean {
    return !this._state.isValid && this._state.errors.length > 0;
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
      if (this.trigger === 'change' || this.showsErrors) void this.validate();
      this.notifyChange();
    }, this.options.debounceMs ?? DEBOUNCE_MS);
  }

  private handleCommit(): void {
    this.clearDebounce();
    this._state.isDirty = true;
    this._state.isTouched = true;
    if (this.trigger !== 'submit' || this.showsErrors) void this.validate();
    this.notifyChange();
  }

  private handleTouch(): void {
    this.clearDebounce();
    this._state.isTouched = true;
    const edited = this._state.isDirty || this.showsErrors;
    const unchanged = this.lastValidatedKey !== null && valueKey(this.adapter.read()) === this.lastValidatedKey;
    // Validate on leaving only if the user edited the field (web.dev timing guidance), and
    // not again if nothing changed since the last run (avoids duplicate async requests).
    if (this.trigger !== 'submit' && edited && !unchanged) void this.validate();
    this.notifyChange();
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private freshState(value: FieldValue): FieldState {
    return { name: this.name, value, isValid: true, isDirty: false, isTouched: false, errors: [], isValidating: false };
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
