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
}

/** What a form shares with its fields. */
export interface FieldFormContext {
  getValue(name: string): FieldValue | undefined;
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
  on(event: FieldControllerEventType, handler: FieldControllerEventHandler): void;
  once(event: FieldControllerEventType, handler: FieldControllerEventHandler): void;
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
  on(event: FieldEvents, handler: FieldEventHandler): void;
  on(event: FormEvents, handler: FormLevelEventHandler): void;
  once(event: FieldEvents, handler: FieldEventHandler): void;
  once(event: FormEvents, handler: FormLevelEventHandler): void;
  off(event: FieldEvents, handler: FieldEventHandler): void;
  off(event: FormEvents, handler: FormLevelEventHandler): void;
}

export interface FormPlugin {
  init(formEl: HTMLFormElement, api: FormPluginHost): void | Promise<void>;
  destroy(): void;
}

export interface FormPluginHost {
  readonly id: string;
  getFieldValue(name: string): string | undefined;
  getFieldNames(): string[];
  setFieldEnabled(name: string, enabled: boolean): void;
  on(event: FieldEvents, handler: FieldEventHandler): void;
  on(event: FormEvents, handler: FormLevelEventHandler): void;
  off(event: FieldEvents, handler: FieldEventHandler): void;
  off(event: FormEvents, handler: FormLevelEventHandler): void;
}

export interface ClientVariant {
  condition: string;
  enabled?: boolean;
}

export type FieldControllerEventType = 'change' | 'valid' | 'invalid';
export type FieldControllerEventHandler = (state: FieldState) => void;

export type FormPluginFactory = () => Promise<{ default: new () => FormPlugin }>;

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
  /** Apply server-side field validation errors and focus the first invalid field. */
  applyValidationErrors(errors: Record<string, string[]>): void;
  /** Navigate to a URL after successful submission. */
  redirect(url: string): void;
  /** Replace the form element with the provided HTML after final submission. */
  finish(html?: string): void;
}

export interface FormSubmitContext extends FormSubmitActions {
  formEl: HTMLFormElement;
  formData: FormData;
  submitter: HTMLElement | null;
  signal: AbortSignal;
}

export type FormSubmitFunction = (context: FormSubmitContext) => Promise<void>;
