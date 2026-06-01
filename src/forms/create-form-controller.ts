import { FormController } from './form-controller';
import type { FormControllerOptions } from './form-controller';
import type { FormControllerApi, FormSubmitFunction } from './types';

/** Create a form controller without the registry (single-form apps). */
export function createFormController(
  formEl: HTMLFormElement,
  submitFn: FormSubmitFunction,
  options?: FormControllerOptions,
): FormControllerApi {
  return new FormController(formEl, submitFn, options);
}
