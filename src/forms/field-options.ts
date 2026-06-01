import type { FieldValidationResult, FormField, ValidatorRule } from './types';
import type { FieldErrorRenderContext } from './field-error-presenter';

export type { FieldErrorRenderContext };

/** Shared hooks for field validation and error rendering (form and standalone paths). */
export interface FieldOptions {
  validate?: (
    value: string,
    rules: ValidatorRule[],
    defaultValidate: () => FieldValidationResult,
  ) => FieldValidationResult;
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
