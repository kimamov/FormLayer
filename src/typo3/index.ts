import { formRegistry } from '../forms/registry';
import { registerFieldType } from '../forms/field-types';
import { registerDefaultValidators, registerValidator } from '../forms/validators';
import { createTypo3Submit } from './submit';
import type { Typo3FormsOptions, Typo3FormsApi } from './types';
import type { FormSubmitFunction, RegistryEventHandler } from '../forms/types';

export { createTypo3Submit, isTypo3AjaxSubmitEnabled } from './submit';
export type { Typo3SubmitDeps } from './submit';
export type { Typo3FormsOptions, Typo3FormsHooks, Typo3AjaxFormResponse, Typo3FormsApi } from './types';

let initialized = false;

export function initTypo3Forms(options?: Typo3FormsOptions): Typo3FormsApi {
  if (initialized) {
    console.warn('[Typo3Forms] initTypo3Forms() called more than once — ignoring duplicate call');
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

  const controllerOptions = {
    ...(options?.fieldSelector ? { fieldSelector: options.fieldSelector } : {}),
    ...(options?.fieldsMap ? { fieldsMap: options.fieldsMap } : {}),
  };
  const hasControllerOptions = Object.keys(controllerOptions).length > 0;

  const unmount = (formEl: HTMLFormElement): void => {
    formRegistry.unregister(formEl.id);
  };

  const remount = (oldFormEl: HTMLFormElement, html: string): HTMLFormElement | null => {
    const formId = oldFormEl.id;
    formRegistry.unregister(formId);

    oldFormEl.outerHTML = html;

    const newFormEl = document.getElementById(formId) as HTMLFormElement | null;
    if (newFormEl) {
      formRegistry.register(newFormEl, submitFn, hasControllerOptions ? controllerOptions : undefined);
    }
    return newFormEl;
  };

  let submitFn: FormSubmitFunction;
  submitFn = options?.onSubmit ?? createTypo3Submit(options?.hooks, { remount, unmount });

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
