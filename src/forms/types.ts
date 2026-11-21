import type { FieldValue } from './field-value';

export type { FieldValue } from './field-value';

export interface ValidatorRule {
  type: string;
  options?: Record<string, unknown>;
  /** Only validated on the server: skipped on the client (and checked by server validation, if enabled). */
  server?: boolean;
}

export interface ValidatorResult {
  valid: boolean;
  /** The message to show (English default for built-ins). */
  message?: string;
  /** Translation key, looked up in `messages` (e.g. `"StringLength.tooShort"`). */
  key?: string;
  /** Values for `{placeholders}` in translated messages. */
  params?: Record<string, unknown>;
}

export interface Validator {
  type: string;
  /**
   * `value` is the field's typed value: `string`, `string[]` (checkbox groups,
   * multi-selects) or `File[]` (file inputs). Validators written for strings
   * can convert with `valueToString()`.
   */
  validate(
    value: FieldValue,
    options: Record<string, unknown>,
    ctx: import('./validation').ValidatorContext,
  ): ValidatorResult | Promise<ValidatorResult>;
}

export interface FieldState {
  name: string;
  value: FieldValue;
  isValid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  errors: string[];
  /** An async validator is still running. */
  isValidating: boolean;
}

export interface FieldValidationResult {
  isValid: boolean;
  errors: string[];
}

/** Form participation contract — implemented by FieldController and custom field types. */
export interface FormField {
  readonly name: string;
  getState(): FieldState;
  /** Run the field's rules. Async rules make this resolve later; sync-only fields resolve at once. */
  validate(): FieldValidationResult | Promise<FieldValidationResult>;
  reset(): void;
  destroy(): void;
  setEnabled(enabled: boolean): void;
  setServerErrors(errors: string[]): void;
  /**
   * Wire field state changes into the parent form (no-op for standalone use).
   * `form` gives validators access to other fields' values.
   */
  connect(onChange: (state: FieldState) => void, form?: FieldFormContext): void;
  focus(): void;
  /** Names of fields this field's rules depend on (`options.field` / `options.fields`). */
  readonly dependencies?: readonly string[];
  /** True if some rule can only be checked by the server (`"server": true` or no client validator). */
  readonly hasServerRules?: boolean;
  /** Mark the field as waiting for a server check (sets `isValidating`). */
  setValidating?(validating: boolean): void;
}

/** What a form shares with its fields. */
export interface FieldFormContext {
  getValue(name: string): FieldValue | undefined;
  /** `false` when the form validates on the server only: fields skip their client rules. */
  readonly clientRules?: boolean;
  /** Called after a field ran its rules because of user interaction or `setValue()`. */
  validated?(name: string, result: FieldValidationResult): void;
}

/**
 * DOM-backed fields with a wrapper, native control, and optional field events.
 */
export interface DomFormField extends FormField {
  readonly element: HTMLElement;
  /** The main control: receives focus, `aria-invalid` and the error link. */
  readonly inputElement: HTMLElement;
  readonly fieldType: string | null;
  readonly enabled: boolean;
  setValue(value: FieldValue): void;
  /** Swap the active control; optional — only needed when the focus target changes. */
  replaceInput?(newInput: HTMLElement): void;
  on(event: FieldControllerEventType, handler: FieldControllerEventHandler): () => void;
  once(event: FieldControllerEventType, handler: FieldControllerEventHandler): () => void;
  off(event: FieldControllerEventType, handler: FieldControllerEventHandler): void;
}

export type FormFieldClass = new (
  wrapper: HTMLElement,
  options?: import('./field-options').FieldOptions,
) => FormField;

export type FormFieldFactory =
  | FormFieldClass
  | (() => Promise<{ default: FormFieldClass }>);


export interface FormState {
  id: string;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  /** Some field is waiting for an async validator. */
  isValidating: boolean;
  /** Errors from form-level rules (`data-validate-form`). */
  formErrors: string[];
  fields: Record<string, FieldState>;
}

export type FormEventType =
  | 'field:valid'
  | 'field:invalid'
  | 'field:change'
  | 'field:added'
  | 'field:removed'
  | 'form:valid'
  | 'form:invalid'
  | 'form:submit'
  | 'form:loading'
  | 'form:reset';

export type RegistryEventType = 'form:registered' | 'form:unregistered';

export interface FieldEventDetail {
  formId: string;
  fieldName: string;
  state: FieldState;
}

export interface FormEventDetail {
  formId: string;
  state: FormState;
}

export type FieldEventHandler = (detail: FieldEventDetail) => void;
export type FormLevelEventHandler = (detail: FormEventDetail) => void;
export type FormEventHandler = FieldEventHandler | FormLevelEventHandler;
export type RegistryEventHandler = (detail: { formId: string }) => void;

type FieldEvents = 'field:valid' | 'field:invalid' | 'field:change' | 'field:added' | 'field:removed';
type FormEvents = 'form:valid' | 'form:invalid' | 'form:submit' | 'form:loading' | 'form:reset';

export interface FormLoadingStateDetail {
  formId: string;
  isSubmitting: boolean;
  submitter: HTMLElement | null;
  formEl: HTMLFormElement;
  state: FormState;
}

export interface FormLoadingStateOptions {
  /** Attribute toggled on the submit button. Default: `data-loading`. */
  attribute?: string;
  /** Selector used when no submitter is available. Default: submit buttons in the form. */
  submitSelector?: string;
}

export interface FormControllerApi {
  readonly id: string;
  /** Resolves once all lazy fields and form plugins have loaded. */
  readonly ready: Promise<void>;
  getField(name: string): FieldState | undefined;
  getState(): FormState;
  validate(): Promise<boolean>;
  submit(): void;
  reset(): void;
  destroy(): void;
  on(event: FieldEvents, handler: FieldEventHandler): () => void;
  on(event: FormEvents, handler: FormLevelEventHandler): () => void;
  once(event: FieldEvents, handler: FieldEventHandler): () => void;
  once(event: FormEvents, handler: FormLevelEventHandler): () => void;
  off(event: FieldEvents, handler: FieldEventHandler): void;
  off(event: FormEvents, handler: FormLevelEventHandler): void;
}

export interface FormPlugin {
  init(formEl: HTMLFormElement, api: FormPluginHost): void | Promise<void>;
  destroy?(): void;
  /** On submit, before client validation. */
  beforeValidate?(ctx: FormPluginSubmitContext): void | Promise<void>;
  /** Adjust the data handed to the submit function: return new `FormData`, or modify it and return nothing. */
  transformFormData?(formData: FormData, ctx: FormPluginSubmitContext): FormData | void | Promise<FormData | void>;
  /** After the submit function finished. `result` is what it passed to `applyResult()`, if anything. */
  afterSubmit?(ctx: FormPluginSubmitContext & { result: import('./submission').SubmissionResult | null }): void | Promise<void>;
}

export interface FormPluginSubmitContext {
  formId: string;
  formEl: HTMLFormElement;
  submitter: HTMLElement | null;
}

/** A plugin class; it is constructed once per form with the options given at registration. */
export type FormPluginClass<O = unknown> = new (options?: O) => FormPlugin;

export interface FormPluginHost {
  readonly id: string;
  getFieldValue(name: string): string | undefined;
  getFieldNames(): string[];
  setFieldEnabled(name: string, enabled: boolean): void;
  on(event: FieldEvents, handler: FieldEventHandler): () => void;
  on(event: FormEvents, handler: FormLevelEventHandler): () => void;
  off(event: FieldEvents, handler: FieldEventHandler): void;
  off(event: FormEvents, handler: FormLevelEventHandler): void;
}

export interface ClientVariant {
  condition: string;
  enabled?: boolean;
}

export type FieldControllerEventType = 'change' | 'valid' | 'invalid';
export type FieldControllerEventHandler = (state: FieldState) => void;

/** A lazily loaded plugin module, e.g. `() => import('./my-plugin')`. */
export type FormPluginFactory = () => Promise<{ default: FormPluginClass }>;

/** What `registerFormPlugin()` accepts: a plugin class (attached immediately) or a lazy module. */
export type FormPluginSource = FormPluginClass | FormPluginFactory;

export const CSS_CLASSES = {
  errorClass: 'is-invalid',
  errorMsgClass: 'invalid-feedback',
  descriptionClass: 'form-text',
} as const;

export const SELECTORS = {
  formField: '[data-form-field]',
  input: 'input, select, textarea',
} as const;

export const DEBOUNCE_MS = 300;

export interface AjaxFormResponse {
  valid: boolean;
  errors: Record<string, string[]>;
  page: { current: number; total: number };
  finished: boolean;
  redirect: string | null;
  message: string | null;
  state: string;
}

export interface FormSubmitActions {
  /** Allow the browser to submit the form natively (bypasses JS handling). */
  fallbackToNative(): void;
  /**
   * Apply a backend-independent submission result: errors, redirect,
   * confirmation or the next form. Returns the form now in the page (the new
   * one after a replace), or `null` when the form is gone.
   */
  applyResult(result: import('./submission').SubmissionResult): HTMLFormElement | null;
  /** Show server errors (by field name, plus optional form-level errors) and focus the first problem. */
  applyValidationErrors(errors: Record<string, string[]>, formErrors?: string[]): void;
  /** Navigate to a URL after successful submission. */
  redirect(url: string): void;
  /** Replace the form with the provided HTML after final submission and move focus to it. */
  finish(html?: string): void;
  /** Replace the form with new form markup (next step), enhance it and focus its heading. */
  replace(html: string): HTMLFormElement | null;
}

export interface FormSubmitContext extends FormSubmitActions {
  formEl: HTMLFormElement;
  formData: FormData;
  submitter: HTMLElement | null;
  signal: AbortSignal;
}

export type FormSubmitFunction = (context: FormSubmitContext) => Promise<void>;

// ---------------------------------------------------------------------------
// DOM events
// ---------------------------------------------------------------------------

export interface BeforeSubmitDetail {
  formId: string;
  formEl: HTMLFormElement;
  submitter: HTMLElement | null;
  state: FormState;
}

export interface SubmitResultDetail {
  formId: string;
  formEl: HTMLFormElement;
  result: import('./submission').SubmissionResult;
}

/**
 * Bubbling `CustomEvent`s FormLayer dispatches. Field events start at the field
 * wrapper, form events at the `<form>`. Listen on either, or on `document`.
 */
export interface FormLayerEventMap {
  'formlayer:field-change': CustomEvent<FieldEventDetail>;
  'formlayer:field-valid': CustomEvent<FieldEventDetail>;
  'formlayer:field-invalid': CustomEvent<FieldEventDetail>;
  'formlayer:field-added': CustomEvent<FieldEventDetail>;
  'formlayer:field-removed': CustomEvent<FieldEventDetail>;
  'formlayer:valid': CustomEvent<FormEventDetail>;
  'formlayer:invalid': CustomEvent<FormEventDetail>;
  'formlayer:submit': CustomEvent<FormEventDetail>;
  'formlayer:loading': CustomEvent<FormEventDetail>;
  'formlayer:reset': CustomEvent<FormEventDetail>;
  /** Cancelable: `preventDefault()` stops the submit before validation. */
  'formlayer:before-submit': CustomEvent<BeforeSubmitDetail>;
  'formlayer:submit-result': CustomEvent<SubmitResultDetail>;
  'formlayer:server-validation-error': CustomEvent<import('./server-validation').ServerValidationErrorDetail>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface HTMLElementEventMap extends FormLayerEventMap {}
}

/** Bus event → DOM event name. */
export const DOM_EVENT_NAMES: Record<FormEventType, keyof FormLayerEventMap> = {
  'field:change': 'formlayer:field-change',
  'field:valid': 'formlayer:field-valid',
  'field:invalid': 'formlayer:field-invalid',
  'field:added': 'formlayer:field-added',
  'field:removed': 'formlayer:field-removed',
  'form:valid': 'formlayer:valid',
  'form:invalid': 'formlayer:invalid',
  'form:submit': 'formlayer:submit',
  'form:loading': 'formlayer:loading',
  'form:reset': 'formlayer:reset',
};
