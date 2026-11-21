import type {
  FormState,
  FormEventType,
  FormEventHandler,
  FieldEventDetail,
  FormEventDetail,
  FormControllerApi,
  FormPluginHost,
  FormPlugin,
  FieldState,
  FormSubmitFunction,
  FormLoadingStateDetail,
  FormLoadingStateOptions,
  FormField,
} from './types';
import { SELECTORS, DOM_EVENT_NAMES } from './types';
import type { FieldControllerOptions } from './field-controller';
import { EventBus } from './events';
import { createField, createFieldAsync, isLazyFactory, type AddFieldFromElementOptions, type CustomFieldsMap } from './create-field';
import { mergeFieldsMap } from './field-types';
import { valueKey, valueToString } from './field-value';
import { runRules, type ValidationMessages } from './validation';
import { getValidator } from './validators/index';
import { escapeHtml } from './html';
import type { FieldFormContext, FieldValidationResult, Validator, ValidatorRule } from './types';
import {
  type SubmissionResult,
  hasErrors,
  parseHtml,
  focusElement,
  findConfirmation,
  findStepFocusTarget,
  focusWasIn,
} from './submission';
import {
  ServerValidationScheduler,
  resolveServerValidationMode,
  type ServerValidationMode,
  type ServerValidationOptions,
} from './server-validation';

let autoId = 0;

const DEFAULT_SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]';
const DEFAULT_LOADING_ATTRIBUTE = 'data-loading';

export interface FormControllerOptions {
  fieldSelector?: string;
  /** Options applied to every field controller in this form. */
  fieldOptions?: FieldControllerOptions;
  /** Set to `false` to disable built-in submit-button loading UI. */
  loadingState?: false | FormLoadingStateOptions;
  /** Called whenever the form loading state changes. Runs after built-in UI unless disabled. */
  onLoadingStateChange?: (detail: FormLoadingStateDetail) => void;
  /**
   * Called when the form fails validation (client- or server-side).
   * Complements the `form:invalid` event for imperative UI such as a summary banner.
   */
  onFormInvalid?: (detail: FormEventDetail) => void;
  /**
   * Render form-level errors yourself. Default: one `<p>` per message inside
   * `[data-fl-form-errors]` in the form.
   */
  renderFormErrors?: (errors: string[], formEl: HTMLFormElement) => void;

  fieldsMap?: CustomFieldsMap;
  /** Validators for this form only, looked up before the global registry. */
  validators?: Validator[];
  /**
   * Opt-in server validation while the user fills in the form. The core
   * schedules the checks; `validate` is the transport. Off unless `mode` (or
   * `data-server-validation` on the form) is `client+server` or `server`.
   */
  serverValidation?: ServerValidationOptions;
  /** Translations for validator message keys in this form (see `setValidationMessages()`). */
  messages?: ValidationMessages;
}

const FORM_ERRORS_SELECTOR = '[data-fl-form-errors]';

export class FormController implements FormControllerApi, FormPluginHost {
  readonly id: string;
  private readonly formEl: HTMLFormElement;
  private readonly fieldSelector: string;
  private readonly fields = new Map<string, FormField>();
  private readonly formPlugins: FormPlugin[] = [];
  private readonly eventBus = new EventBus();
  private readonly observer: MutationObserver;
  private readonly abortController = new AbortController();
  private readonly submitFn: FormSubmitFunction;
  private readonly options?: FormControllerOptions;
  private replaceHandler: ((formEl: HTMLFormElement) => FormControllerApi) | null = null;
  private readonly fieldOptions?: FieldControllerOptions;
  private readonly loadingStateOptions: false | FormLoadingStateOptions;
  private readonly onLoadingStateChange?: (detail: FormLoadingStateDetail) => void;
  private readonly onFormInvalid?: (detail: FormEventDetail) => void;

  private readonly _fieldsMap: CustomFieldsMap;

  private _isSubmitting = false;
  private _allowSubmit = false;
  private _activeSubmitter: HTMLElement | null = null;
  private _destroyed = false;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly destroyCallbacks: Array<() => void> = [];
  private readonly formRules: ValidatorRule[];
  private readonly lastValues = new Map<string, string>();
  private clientFormErrors: string[] = [];
  private serverFormErrors: string[] = [];
  private readonly serverMode: ServerValidationMode;
  private readonly serverScheduler: ServerValidationScheduler | null;
  private formRulesRun = 0;
  private readonly fieldContext: FieldFormContext = this.createFieldContext();

  constructor(formEl: HTMLFormElement, submitFn: FormSubmitFunction, options?: FormControllerOptions) {
    this.formEl = formEl;
    this.id = formEl.id || `formlayer-${++autoId}`;
    this.submitFn = submitFn;
    this.options = options;
    this.fieldSelector = options?.fieldSelector ?? SELECTORS.formField;
    this.fieldOptions = {
      ...options?.fieldOptions,
      validators: [...(options?.validators ?? []), ...(options?.fieldOptions?.validators ?? [])],
      messages: options?.fieldOptions?.messages ?? options?.messages,
    };
    this.formRules = this.parseFormRules();
    this.serverMode = resolveServerValidationMode(formEl, options?.serverValidation);
    this.serverScheduler = this.serverMode === 'client' || !options?.serverValidation
      ? null
      : new ServerValidationScheduler(options.serverValidation, {
        formEl,
        field: (name) => this.fields.get(name),
        applyFormErrors: (errors) => {
          this.serverFormErrors = errors;
          this.renderFormErrors();
        },
      });

    this.loadingStateOptions = options?.loadingState ?? {};
    this.onLoadingStateChange = options?.onLoadingStateChange;
    this.onFormInvalid = options?.onFormInvalid;
    this._fieldsMap = mergeFieldsMap(options?.fieldsMap);

    this.formEl.setAttribute('novalidate', '');

    this.discoverFields();
    this.observer = this.createObserver();
    this.bindSubmit();
  }

  get fieldsMap(): Readonly<CustomFieldsMap> {
    return this._fieldsMap;
  }

  /**
   * Resolves once every pending lazy field and form plugin has loaded
   * (including ones that start loading while waiting). Submitting waits for it,
   * so lazy fields are never skipped by validation.
   */
  get ready(): Promise<void> {
    return this.waitForPending();
  }

  /** Track async setup work (lazy fields, plugins) so {@link ready} waits for it. */
  track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise);
    const remove = () => { this.pending.delete(promise); };
    promise.then(remove, remove);
    return promise;
  }

  /** Register a callback that runs once when this controller is destroyed. */
  onDestroy(callback: () => void): void {
    this.destroyCallbacks.push(callback);
  }

  private async waitForPending(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  getField(name: string): FieldState | undefined {
    return this.fields.get(name)?.getState();
  }

  getState(): FormState {
    const fields: Record<string, FieldState> = {};
    for (const [name, ctrl] of this.fields) {
      fields[name] = ctrl.getState();
    }

    return {
      id: this.id,
      isValid: this.computeIsValid(),
      isSubmitting: this._isSubmitting,
      isDirty: this.computeIsDirty(),
      isValidating: Object.values(fields).some((f) => f.isValidating),
      formErrors: this.formErrors,
      fields,
    };
  }

  /**
   * Validate every field and the form-level rules, waiting for async rules.
   * Focuses the first invalid field, or the form error container when only
   * form-level rules failed.
   */
  async validate(): Promise<boolean> {
    const fields = [...this.fields.values()];
    const [results] = await Promise.all([
      Promise.all(fields.map((ctrl) => Promise.resolve(ctrl.validate()))),
      this.validateFormRules(),
    ]);

    const firstInvalid = fields.find((_, i) => !results[i].isValid) ?? null;
    const isValid = this.computeIsValid();
    const detail: FormEventDetail = { formId: this.id, state: this.getState() };
    if (!isValid) {
      this.onFormInvalid?.(detail);
    }
    this.emit(isValid ? 'form:valid' : 'form:invalid', detail);

    if (firstInvalid) {
      firstInvalid.focus();
    } else if (this.formErrors.length > 0) {
      this.formErrorsElement()?.focus();
    }

    return isValid;
  }

  reset(): void {
    for (const ctrl of this.fields.values()) {
      ctrl.reset();
    }
    this.emit('form:reset', { formId: this.id, state: this.getState() });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._isSubmitting) {
      this.setSubmitting(false, this._activeSubmitter);
    }
    this.abortController.abort();
    this.serverScheduler?.cancel();
    this.observer.disconnect();
    for (const plugin of this.formPlugins) {
      try {
        plugin.destroy?.();
      } catch (err) {
        console.error('[FormLayer] Error destroying form plugin:', err);
      }
    }
    this.formPlugins.length = 0;
    for (const ctrl of this.fields.values()) {
      ctrl.destroy();
    }
    this.fields.clear();
    this.eventBus.destroy();
    for (const callback of this.destroyCallbacks.splice(0)) {
      try {
        callback();
      } catch (err) {
        console.error('[FormLayer] Error in destroy callback:', err);
      }
    }
  }

  submit(): void {
    this.formEl.requestSubmit();
  }

  /**
   * Emit on the internal bus and dispatch the matching bubbling `formlayer:*`
   * DOM event: field events on the field wrapper (or the form, once the
   * wrapper is gone), form events on the form.
   */
  private emit(type: FormEventType, detail: FieldEventDetail | FormEventDetail): void {
    this.eventBus.emit(type, detail);
    if (this._destroyed) return;
    let target: Element = this.formEl;
    if ('fieldName' in detail) {
      const wrapper = (this.fields.get(detail.fieldName) as { element?: HTMLElement } | undefined)?.element;
      if (wrapper?.isConnected && this.formEl.contains(wrapper)) target = wrapper;
    }
    target.dispatchEvent(new CustomEvent(DOM_EVENT_NAMES[type], { bubbles: true, detail }));
  }

  /** Subscribe to form events; returns a function that unsubscribes. */
  on(event: FormEventType, handler: FormEventHandler): () => void {
    return this.eventBus.on(event, handler);
  }

  once(event: FormEventType, handler: FormEventHandler): () => void {
    return this.eventBus.once(event, handler);
  }

  off(event: FormEventType, handler: FormEventHandler): void {
    this.eventBus.off(event, handler);
  }

  async attachFormPlugin(plugin: FormPlugin): Promise<void> {
    this.formPlugins.push(plugin);
    await this.track(Promise.resolve(plugin.init(this.formEl, this)));
  }

  /** The field's value as one string (lists joined with commas), for conditions and plugins. */
  getFieldValue(name: string): string | undefined {
    const value = this.fields.get(name)?.getState().value;
    return value === undefined ? undefined : valueToString(value);
  }

  getFieldNames(): string[] {
    return [...this.fields.keys()];
  }

  getFieldsIn(element: Element): string[] {
    const names: string[] = [];
    for (const [name, field] of this.fields) {
      const wrapper = (field as { element?: HTMLElement }).element;
      if (wrapper && (wrapper === element || element.contains(wrapper))) names.push(name);
    }
    return names;
  }

  setFieldEnabled(name: string, enabled: boolean): void {
    const ctrl = this.fields.get(name);
    if (ctrl) ctrl.setEnabled(enabled);
  }

  addField(field: FormField): void {
    const name = field.name;
    if (!name) {
      console.warn('[FormLayer] addField() ignored: field has no name');
      return;
    }

    const existing = this.fields.get(name);
    if (existing) existing.destroy();

    this.registerField(field, name);
  }

  addFieldFromElement(wrapper: HTMLElement, options?: AddFieldFromElementOptions): FormField {
    const { field: factory, ...fieldOptions } = options ?? {};
    const hasFieldOptions = Object.keys(fieldOptions).length > 0;
    const field = createField(wrapper, {
      factory,
      customFields: this._fieldsMap,
      fieldOptions: hasFieldOptions ? { ...this.fieldOptions, ...fieldOptions } : this.fieldOptions,
    });
    this.addField(field);
    return field;
  }

  removeField(name: string): void {
    const field = this.fields.get(name);
    if (!field) return;

    const detail: FieldEventDetail = {
      formId: this.id,
      fieldName: name,
      state: field.getState(),
    };

    field.destroy();
    this.fields.delete(name);
    this.emit('field:removed', detail);
  }


  private discoverFields(): void {
    const wrappers = this.formEl.querySelectorAll<HTMLElement>(this.fieldSelector);
    wrappers.forEach((wrapper) => this.initFieldFromElement(wrapper));
  }

  /**
 * Instantiate a FormField from a `[data-form-field]` wrapper.
 *
 * If `customFields` contains a matching `data-field-type` entry:
 *  - Sync class  → instantiated immediately
 *  - Lazy factory → resolved via dynamic import, then registered on completion
 *
 * Otherwise falls back to the default FieldController.
 */
  private initFieldFromElement(wrapper: HTMLElement): void {
    const name = wrapper.getAttribute('data-form-field');
    if (!name || this.fields.has(name)) return;

    const type = wrapper.getAttribute('data-field-type');
    const factory = type ? this._fieldsMap[type] : undefined;

    if (factory && isLazyFactory(factory)) {
      this.track(
        createFieldAsync(wrapper, { factory, fieldOptions: this.fieldOptions })
          .then((field) => {
            if (this._destroyed || !wrapper.isConnected) {
              field.destroy();
              return;
            }
            if (!this.fields.has(name)) this.registerField(field, name);
          })
          .catch((err) => {
            console.warn(`[FormLayer] Failed to load field "${type}":`, err);
          }),
      );
      return;
    }

    try {
      const field = createField(wrapper, { customFields: this._fieldsMap, fieldOptions: this.fieldOptions });
      this.registerField(field, name);
    } catch (err) {
      console.warn(`[FormLayer] Could not init field "${name}":`, err);
    }
  }

  private registerField(field: FormField, name: string): void {
    field.connect((state) => this.handleFieldChange(state), this.fieldContext);
    this.fields.set(name, field);
    this.lastValues.set(name, valueKey(field.getState().value));

    const detail: FieldEventDetail = {
      formId: this.id,
      fieldName: name,
      state: field.getState(),
    };
    this.emit('field:added', detail);
  }

  private handleFieldChange(state: FieldState): void {
    this.emitFieldEvents(state);

    // Only a changed value can affect other fields (async results re-notify with the same value).
    const key = valueKey(state.value);
    if (this.lastValues.get(state.name) === key) return;
    this.lastValues.set(state.name, key);

    // Re-validate fields whose rules refer to this one, once the user has been there.
    for (const dependent of this.fields.values()) {
      if (dependent.name === state.name || !dependent.dependencies?.includes(state.name)) continue;
      const depState = dependent.getState();
      if (!depState.isTouched && !depState.isDirty) continue;
      void Promise.resolve(dependent.validate()).then(() => this.emitFieldEvents(dependent.getState()));
    }

    // Form-level errors clear as soon as the user fixes them.
    if (this.formErrors.length > 0) void this.validateFormRules();
  }

  private emitFieldEvents(state: FieldState): void {
    const eventType: FormEventType = state.isValid ? 'field:valid' : 'field:invalid';
    const detail: FieldEventDetail = {
      formId: this.id,
      fieldName: state.name,
      state,
    };
    this.emit('field:change', detail);
    this.emit(eventType, detail);
  }

  /** Run `data-validate-form` rules and render their errors into `[data-fl-form-errors]`. */
  private async validateFormRules(): Promise<string[]> {
    if (this.formRules.length === 0 || this.serverMode === 'server') return this.clientFormErrors;
    const run = ++this.formRulesRun;
    const { errors, pending } = runRules(this.formRules, '', {
      field: { name: '__form', element: this.formEl },
      form: this.fieldContext,
      files: [],
      signal: this.abortController.signal,
    }, {
      validators: this.fieldOptions?.validators,
      messages: this.fieldOptions?.messages,
      getValidator,
    });
    const all = pending ? await pending : errors;
    if (run === this.formRulesRun && !this._destroyed) {
      this.clientFormErrors = all;
      this.renderFormErrors();
    }
    return all;
  }

  /** What fields see of the form: other values, whether to run client rules, and a hook after they validate. */
  private createFieldContext(): FieldFormContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const controller = this;
    return {
      getValue: (name) => controller.fields.get(name)?.getState().value,
      get clientRules() {
        return controller.serverMode === 'server' ? false : undefined;
      },
      validated: (name, result) => controller.handleFieldValidated(name, result),
    };
  }

  /** Client form-rule errors followed by form-level errors from server checks. */
  private get formErrors(): string[] {
    return [...this.clientFormErrors, ...this.serverFormErrors];
  }

  /** The mode in effect for this form (`data-server-validation` or the option). */
  get serverValidationMode(): ServerValidationMode {
    return this.serverMode;
  }

  /** A field finished validating because of the user: follow up with a server check if the mode asks for it. */
  private handleFieldValidated(name: string, result: FieldValidationResult): void {
    const scheduler = this.serverScheduler;
    const field = this.fields.get(name);
    if (!scheduler || !field || this._isSubmitting) return;
    if (this.serverMode === 'server' || (result.isValid && field.hasServerRules)) {
      scheduler.request(name);
    }
  }

  private formErrorsElement(): HTMLElement | null {
    return this.formEl.querySelector<HTMLElement>(FORM_ERRORS_SELECTOR);
  }

  private renderFormErrors(): void {
    if (this.options?.renderFormErrors) {
      this.options.renderFormErrors(this.formErrors, this.formEl);
      return;
    }
    const container = this.formErrorsElement();
    if (!container) return;
    container.innerHTML = this.formErrors.map((message) => `<p>${escapeHtml(message)}</p>`).join('');
  }

  /** Set by the registry: how a form swapped in by `replace()` gets enhanced. */
  setReplaceHandler(handler: (formEl: HTMLFormElement) => FormControllerApi): void {
    this.replaceHandler = handler;
  }

  private parseFormRules(): ValidatorRule[] {
    const raw = this.formEl.getAttribute('data-validate-form');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as ValidatorRule[] : [];
    } catch {
      console.warn(`[FormLayer] Invalid data-validate-form JSON on form "${this.id}"`);
      return [];
    }
  }

  private createObserver(): MutationObserver {
    const selector = this.fieldSelector;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const targets = node.matches(selector)
            ? [node]
            : Array.from(node.querySelectorAll<HTMLElement>(selector));
          targets.forEach((el) => this.initFieldFromElement(el));
        }
        for (const node of Array.from(mutation.removedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const targets = node.matches(selector)
            ? [node]
            : Array.from(node.querySelectorAll<HTMLElement>(selector));
          targets.forEach((el) => {
            const fieldName = el.getAttribute('data-form-field');
            if (fieldName) this.removeField(fieldName);
          });
        }
      }
    });

    observer.observe(this.formEl, { childList: true, subtree: true });
    return observer;
  }

  private bindSubmit(): void {
    const signal = this.abortController.signal;

    this.formEl.addEventListener(
      'submit',
      async (e) => {
        if (this._allowSubmit) {
          this._allowSubmit = false;
          return;
        }

        e.preventDefault();
        const submitter = (e as SubmitEvent).submitter instanceof HTMLElement
          ? (e as SubmitEvent).submitter
          : null;

        const proceed = this.formEl.dispatchEvent(new CustomEvent('formlayer:before-submit', {
          bubbles: true,
          cancelable: true,
          detail: { formId: this.id, formEl: this.formEl, submitter, state: this.getState() },
        }));
        if (!proceed) return;

        // `formnovalidate` on the submitter (e.g. a multistep "Back" button) skips client validation.
        const skipValidation = !!submitter && (submitter as HTMLButtonElement | HTMLInputElement).formNoValidate === true;
        const pluginCtx = { formId: this.id, formEl: this.formEl, submitter };
        this.setSubmitting(true, submitter);
        this.emit('form:submit', { formId: this.id, state: this.getState() });

        try {
          await this.ready;
          // Server checks in flight are superseded by the submit, which the server validates anyway.
          this.serverScheduler?.cancel();
          this.serverFormErrors = [];
          this.renderFormErrors();

          await this.runPluginHook('beforeValidate', (plugin) => plugin.beforeValidate?.(pluginCtx));

          // In `server` mode there are no client rules: the submit response reports the errors.
          const isValid = skipValidation || this.serverMode === 'server' || await this.validate();
          if (!isValid) return;

          let formData = new FormData(this.formEl, submitter ?? undefined);
          for (const plugin of this.formPlugins) {
            try {
              formData = (await plugin.transformFormData?.(formData, pluginCtx)) ?? formData;
            } catch (err) {
              console.error('[FormLayer] Form plugin transformFormData failed:', err);
            }
          }

          let lastResult: SubmissionResult | null = null;
          await this.submitFn({
            formEl: this.formEl,
            formData,
            submitter,
            signal: this.abortController.signal,
            fallbackToNative: () => {
              this._allowSubmit = true;
              this.formEl.requestSubmit();
            },
            applyResult: (result) => {
              lastResult = result;
              return this.applyResult(result);
            },
            applyValidationErrors: (errors, formErrors) => {
              this.applyServerErrors(errors, formErrors);
            },
            redirect: (url) => {
              window.location.href = url;
            },
            finish: (html) => this.finish(html),
            replace: (html) => this.replaceForm(html),
          });

          await this.runPluginHook('afterSubmit', (plugin) => plugin.afterSubmit?.({ ...pluginCtx, result: lastResult }));
        } finally {
          this.setSubmitting(false, submitter);
        }
      },
      { signal },
    );
  }

  private async runPluginHook(name: string, call: (plugin: FormPlugin) => unknown): Promise<void> {
    for (const plugin of this.formPlugins) {
      try {
        await call(plugin);
      } catch (err) {
        console.error(`[FormLayer] Form plugin ${name} failed:`, err);
      }
    }
  }

  /** See {@link FormSubmitActions.applyResult}. */
  private applyResult(result: SubmissionResult): HTMLFormElement | null {
    this.formEl.dispatchEvent(new CustomEvent('formlayer:submit-result', {
      bubbles: true,
      detail: { formId: this.id, formEl: this.formEl, result },
    }));

    if (hasErrors(result)) {
      this.applyServerErrors(result.fields ?? {}, result.form ?? []);
      return this.formEl;
    }
    if (result.redirect) {
      window.location.href = result.redirect;
      return null;
    }
    if (result.finished) {
      this.finish(result.message ?? undefined);
      return null;
    }
    if (result.html) {
      return this.replaceForm(result.html);
    }
    return this.formEl;
  }

  /** Destroy the controller and replace the form with the confirmation markup, moving focus to it. */
  private finish(html?: string): void {
    const moveFocus = focusWasIn(this.formEl);
    this.destroy();
    if (!html) return;
    const nodes = parseHtml(html);
    this.formEl.replaceWith(...nodes);
    if (moveFocus) focusElement(findConfirmation(nodes));
  }

  /**
   * Replace the form with new form markup (the next step of a multistep form),
   * enhance the new form with the same options, and move focus to its heading.
   */
  private replaceForm(html: string): HTMLFormElement | null {
    const moveFocus = focusWasIn(this.formEl);
    const nodes = parseHtml(html);
    const newForm = nodes.find((n): n is HTMLFormElement => n instanceof HTMLFormElement)
      ?? nodes.map((n) => (n instanceof Element ? n.querySelector('form') : null)).find(Boolean) ?? null;

    this.destroy();
    this.formEl.replaceWith(...nodes);
    if (!newForm) return null;

    if (this.replaceHandler) {
      this.replaceHandler(newForm);
    } else {
      new FormController(newForm, this.submitFn, this.options);
    }
    if (moveFocus) focusElement(findStepFocusTarget(newForm));
    return newForm;
  }

  private applyServerErrors(errors: Record<string, string[]>, formErrors: string[] = []): void {
    for (const [fieldName, messages] of Object.entries(errors)) {
      const ctrl = this.fields.get(fieldName);
      if (ctrl) {
        ctrl.setServerErrors(messages);
      }
    }
    this.serverFormErrors = formErrors;
    this.renderFormErrors();

    const firstInvalidField = [...this.fields.values()].find((c) => !c.getState().isValid);
    if (firstInvalidField) {
      firstInvalidField.focus();
    } else if (formErrors.length > 0) {
      this.formErrorsElement()?.focus();
    }

    const detail: FormEventDetail = { formId: this.id, state: this.getState() };
    this.onFormInvalid?.(detail);
    this.emit('form:invalid', detail);
  }

  private applyDefaultLoadingState(submitter: HTMLElement | null, isSubmitting: boolean): void {
    if (this.loadingStateOptions === false) {
      return;
    }

    const attribute = this.loadingStateOptions.attribute ?? DEFAULT_LOADING_ATTRIBUTE;
    const target = this.resolveSubmitter(submitter);
    if (!target) {
      return;
    }

    if (isSubmitting) {
      target.setAttribute(attribute, '');
    } else {
      target.removeAttribute(attribute);
    }
  }

  private resolveSubmitter(submitter: HTMLElement | null): HTMLElement | null {
    if (submitter instanceof HTMLElement && this.formEl.contains(submitter)) {
      return submitter;
    }

    const selector = this.loadingStateOptions === false
      ? DEFAULT_SUBMIT_SELECTOR
      : (this.loadingStateOptions.submitSelector ?? DEFAULT_SUBMIT_SELECTOR);

    return this.formEl.querySelector<HTMLElement>(selector);
  }

  private setSubmitting(isSubmitting: boolean, submitter: HTMLElement | null): void {
    this._isSubmitting = isSubmitting;
    this._activeSubmitter = isSubmitting ? submitter : null;

    this.applyDefaultLoadingState(submitter, isSubmitting);

    const detail: FormLoadingStateDetail = {
      formId: this.id,
      isSubmitting,
      submitter,
      formEl: this.formEl,
      state: this.getState(),
    };

    this.onLoadingStateChange?.(detail);
    this.emit('form:loading', { formId: this.id, state: detail.state });
  }

  private computeIsValid(): boolean {
    if (this.formErrors.length > 0) return false;
    for (const ctrl of this.fields.values()) {
      if (!ctrl.getState().isValid) return false;
    }
    return true;
  }

  private computeIsDirty(): boolean {
    for (const ctrl of this.fields.values()) {
      if (ctrl.getState().isDirty) return true;
    }
    return false;
  }
}
