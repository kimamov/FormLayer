export interface ValidatorRule {
  type: string;
  options?: Record<string, unknown>;
}

export interface ValidatorResult {
  valid: boolean;
  message: string;
}

export interface Validator {
  type: string;
  validate(value: string, options: Record<string, unknown>): ValidatorResult | Promise<ValidatorResult>;
}

export interface FieldState {
  name: string;
  value: string;
  isValid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  errors: string[];
}

export interface FieldValidationResult {
  isValid: boolean;
  errors: string[];
}

/** Form participation contract — implemented by FieldController and custom field types. */
export interface FormField {
  readonly name: string;
  getState(): FieldState;
  validate(): FieldValidationResult;
  reset(): void;
  destroy(): void;
  setEnabled(enabled: boolean): void;
  setServerErrors(errors: string[]): void;
  /** Wire field state changes into the parent form (no-op for standalone use). */
  connect(onChange: (state: FieldState) => void): void;
  focus(): void;
  /** optional fields that can be usefull */
}

/**
 * DOM-backed fields with a wrapper, native control, and optional field events.
 */
export interface DomFormField extends FormField {
  readonly element: HTMLElement;
  readonly inputElement: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  readonly fieldType: string | null;
  readonly enabled: boolean;
  setValue(value: string): void;
  /** Swap the active control; optional — only needed when the focus target changes. */
  replaceInput?(newInput: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void;
  on(event: FieldControllerEventType, handler: FieldControllerEventHandler): void;
  once(event: FieldControllerEventType, handler: FieldControllerEventHandler): void;
  off(event: FieldControllerEventType, handler: FieldControllerEventHandler): void;
}

export type FormFieldClass = new (wrapper: HTMLElement, options?: Record<string, unknown>) => FormField;

export type FormFieldFactory =
  | FormFieldClass
  | (() => Promise<{ default: FormFieldClass }>);


export interface FormState {
  id: string;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
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

export interface AddFieldFromElementOptions {
  field?: FormFieldFactory;
  validate?: (
    value: string,
    rules: ValidatorRule[],
    defaultValidate: () => FieldValidationResult,
  ) => FieldValidationResult;
  onServerErrors?: (errors: string[], fieldName: string) => string[];
  renderErrors?: (errors: string[], field: FormField) => void;
}

export interface FormControllerApi {
  readonly id: string;
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
