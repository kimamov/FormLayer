import type {
  Validator,
  FormSubmitFunction,
  FormSubmitContext,
  AjaxFormResponse,
  FormControllerApi,
  FormPluginFactory,
} from '../forms/types';
import type { CustomFieldsMap } from '../forms/create-field';
import type { ValidationMessages } from '../forms/validation';
import type { ServerValidationOptions } from '../forms/server-validation';
import type { FormRegistry } from '../forms/registry';

export interface Typo3FormsOptions {
  disableDefaultValidators?: boolean;
  additionalValidators?: Validator[];
  /** Translations for validator message keys, e.g. rendered from TYPO3 XLIFF as JSON. */
  validationMessages?: ValidationMessages;
  /**
   * Server validation while the user fills in the form. Uses the TYPO3
   * transport (`createTypo3ServerValidation()`) unless you pass your own
   * `validate`. Off until a form opts in with `data-server-validation` (or you
   * set `mode`), and only on AJAX-enabled forms. `false` turns it off entirely.
   */
  serverValidation?: Partial<ServerValidationOptions> | false;
  /** Extra custom field types registered globally before form init. */
  additionalFieldTypes?: CustomFieldsMap;
  additionalFormPlugins?: FormPluginFactory[];
  onSubmit?: FormSubmitFunction;
  formSelector?: string;
  fieldSelector?: string;
  /** Per-form custom field overrides merged with globally registered types. */
  fieldsMap?: CustomFieldsMap;
  hooks?: Typo3FormsHooks;
}

export interface Typo3FormsHooks {
  onFormRegistered?(api: FormControllerApi): void;
  onBeforeSubmit?(context: FormSubmitContext): boolean | void;
  onAfterSubmit?(response: Typo3AjaxFormResponse, formEl: HTMLFormElement): void;
  onStepChange?(page: { current: number; total: number }, formEl: HTMLFormElement): void;
  onFormFinished?(response: Typo3AjaxFormResponse, formEl: HTMLFormElement): void;
  onValidationError?(errors: Record<string, string[]>, formEl: HTMLFormElement): void;
  onSubmitError?(error: Error, formEl: HTMLFormElement): void;
}

export interface Typo3AjaxFormResponse extends AjaxFormResponse {
  html?: string;
}


export interface Typo3FormsApi {
  registry: FormRegistry;
  destroy(): void;
}
