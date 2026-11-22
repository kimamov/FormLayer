import { formRegistry } from '../forms/registry';
import { registerFieldType } from '../forms/field-types';
import { registerDefaultValidators, registerValidator } from '../forms/validators';
import { createTypo3Submit } from './submit';
import { createTypo3ServerValidation } from './server-validation';
import type { ServerValidationOptions } from '../forms/server-validation';
import type { Typo3FormsOptions, Typo3FormsApi } from './types';
import type { FormSubmitFunction, RegistryEventHandler } from '../forms/types';

export { createTypo3Submit, isTypo3AjaxSubmitEnabled, typo3ErrorsToResult } from './submit';
export { createTypo3ServerValidation, normalizeTypo3ValidationResponse } from './server-validation';
export type { Typo3ServerValidationOptions } from './server-validation';
export type { Typo3FormsOptions, Typo3FormsHooks, Typo3AjaxFormResponse, Typo3FormsApi } from './types';

let initialized = false;

export function initTypo3Forms(options?: Typo3FormsOptions): Typo3FormsApi {
  if (initialized) {
    console.warn('[FormLayer] initTypo3Forms() called more than once — ignoring duplicate call');
    return { registry: formRegistry, destroy() {} };
  }
  initialized = true;

  if (!options?.disableDefaultValidators) {
    registerDefaultValidators();
  }

  for (const v of options?.additionalValidators ?? []) {
    registerValidator(v);
  }

  for (const [type, factory] of Object.entries(options?.additionalFieldTypes ?? {})) {
    registerFieldType(type, factory);
  }

  for (const factory of options?.additionalFormPlugins ?? []) {
    formRegistry.registerFormPlugin(factory);
  }

  const serverValidation = resolveServerValidation(options?.serverValidation);

  const controllerOptions = {
    ...(options?.fieldSelector ? { fieldSelector: options.fieldSelector } : {}),
    ...(options?.fieldsMap ? { fieldsMap: options.fieldsMap } : {}),
    ...(options?.validationMessages ? { messages: options.validationMessages } : {}),
    ...(serverValidation ? { serverValidation } : {}),
    ...(options?.classes ? { classes: options.classes } : {}),
  };
  const hasControllerOptions = Object.keys(controllerOptions).length > 0;


  const submitFn: FormSubmitFunction = options?.onSubmit ?? createTypo3Submit(options?.hooks);

  let registeredHandler: RegistryEventHandler | null = null;
  if (options?.hooks?.onFormRegistered) {
    const hook = options.hooks.onFormRegistered;
    registeredHandler = ({ formId }) => {
      const api = formRegistry.get(formId);
      if (api) hook(api);
    };
    formRegistry.on('form:registered', registeredHandler);
  }

  const formSelector = options?.formSelector;

  const init = () => formRegistry.init({
    submitFn,
    formSelector,
    controllerOptions: hasControllerOptions ? controllerOptions : undefined,
  });

  let domListener: (() => void) | null = null;
  if (document.readyState === 'loading') {
    domListener = init;
    document.addEventListener('DOMContentLoaded', domListener);
  } else {
    init();
  }

  return {
    registry: formRegistry,
    destroy() {
      for (const [formId] of formRegistry.getAll()) {
        formRegistry.unregister(formId);
      }
      if (registeredHandler) {
        formRegistry.off('form:registered', registeredHandler);
      }
      if (domListener) {
        document.removeEventListener('DOMContentLoaded', domListener);
      }
      initialized = false;
    },
  };
}

/** The TYPO3 transport by default; options without `validate` adjust it; a full `validate` replaces it. */
function resolveServerValidation(
  option: Partial<ServerValidationOptions> | false | undefined,
): ServerValidationOptions | undefined {
  if (option === false) return undefined;
  const defaults = createTypo3ServerValidation({ mode: option?.mode, debounceMs: option?.debounceMs });
  if (!option?.validate) return { ...defaults, ...option, validate: defaults.validate } as ServerValidationOptions;
  return option as ServerValidationOptions;
}
