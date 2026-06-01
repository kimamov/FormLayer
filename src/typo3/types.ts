import type {
  Validator,
  FormSubmitFunction,
  FormSubmitContext,
  AjaxFormResponse,
  FormControllerApi,
  FormPluginFactory,
} from '../forms/types';
import type { CustomFieldsMap } from '../forms/create-field';
import type { FormRegistry } from '../forms/registry';

export interface Typo3FormsOptions {
  disableDefaultValidators?: boolean;
  additionalValidators?: Validator[];
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

export type Typo3RemountFn = (oldFormEl: HTMLFormElement, html: string) => HTMLFormElement | null;
export type Typo3UnmountFn = (formEl: HTMLFormElement) => void;

export interface Typo3FormsApi {
  registry: FormRegistry;
  destroy(): void;
}
