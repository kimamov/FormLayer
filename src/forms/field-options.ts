import type { FieldValidationResult, FieldValue, FormField, Validator, ValidatorRule } from './types';
import type { ValidationMessages } from './validation';
import type { FieldErrorRenderContext } from './field-error-presenter';

export type { FieldErrorRenderContext };

/** When a field validates while the user works on it. Submitting always validates every field. */
export type ValidateOn = 'blur' | 'change' | 'submit';

/** Shared hooks for field validation and error rendering (form and standalone paths). */
export interface FieldOptions {
  /**
   * Default trigger, overridden per field by `data-validate-on`:
   * - `blur` (default): validate when the user leaves a field they edited; while
   *   errors are shown, re-check as they type so errors clear once fixed.
   * - `change`: also validate while typing (after a short pause).
   * - `submit`: only on submit; shown errors still clear as the user fixes them.
   */
  validateOn?: ValidateOn;
  /** Pause after typing before validating, in ms. Default 300. */
  debounceMs?: number;
  /** Validators for this field or form, looked up before the global registry. */
  validators?: Validator[];
  /** Translations for validator message keys (see `setValidationMessages()`). */
  messages?: ValidationMessages;
  validate?: (
    value: FieldValue,
    rules: ValidatorRule[],
    defaultValidate: () => FieldValidationResult | Promise<FieldValidationResult>,
  ) => FieldValidationResult | Promise<FieldValidationResult>;
  onServerErrors?: (errors: string[], fieldName: string) => string[];
  /** CSS selector scoped to the field wrapper. Used after id-based lookups, before the default class fallback. */
  errorsSelector?: string;
  /** Resolve the errors container. Takes precedence over errorsSelector and built-in lookups. */
  findErrorsElement?: (field: FormField) => HTMLElement | null;
  /** Render a single error message as HTML. Used by default rendering; ignored when renderErrors is set. */
  renderError?: (ctx: FieldErrorRenderContext, field: FormField) => string;
  /** Join rendered error fragments. Default: `<br/>`. Ignored when renderErrors is set. */
  errorsSeparator?: string;
  /** Replace the entire error rendering step. When set, renderError and errorsSeparator are ignored. */
  renderErrors?: (errors: string[], field: FormField) => void;
}
