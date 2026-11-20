import type { FormControllerApi, RegistryEventType, RegistryEventHandler, FormPluginFactory, FormSubmitFunction } from './types';
import { FormController } from './form-controller';
import type { FormControllerOptions } from './form-controller';
import { EventBus } from './events';

export interface RegistryInitArguments {
  submitFn: FormSubmitFunction;
  root?: ParentNode;
  formSelector?: string;
  controllerOptions?: FormControllerOptions;
}

export class FormRegistry {
  private readonly forms = new Map<string, FormController>();
  private readonly formPluginFactories: FormPluginFactory[] = [];
  private readonly eventBus = new EventBus();
  private _initialized = false;

  init({
    submitFn,
    root = document,
    formSelector = 'form[id]',
    controllerOptions,
  }: RegistryInitArguments): void {
    this._initialized = true;
    const formElements = root.querySelectorAll<HTMLFormElement>(formSelector);
    formElements.forEach((formEl) => this.register(formEl, submitFn, controllerOptions));
  }

  register(formEl: HTMLFormElement, submitFn: FormSubmitFunction, controllerOptions?: FormControllerOptions): FormControllerApi {
    if (this.forms.has(formEl.id)) {
      return this.forms.get(formEl.id)!;
    }

    const controller = new FormController(formEl, submitFn, controllerOptions);
    const formId = formEl.id;
    this.forms.set(formId, controller);
    // Unregister however the controller ends: unregister(), or finish() after a successful submit.
    controller.onDestroy(() => {
      if (this.forms.get(formId) !== controller) return;
      this.forms.delete(formId);
      this.eventBus.emit('form:unregistered', { formId });
    });
    this.loadFormPlugins(controller);
    this.eventBus.emit('form:registered', { formId: formEl.id });
    return controller;
  }

  private loadFormPlugins(controller: FormController): void {
    for (const factory of this.formPluginFactories) {
      controller.track(
        factory()
          .then(({ default: PluginClass }) => {
            const plugin = new PluginClass();
            return controller.attachFormPlugin(plugin);
          })
          .catch((err) => {
            console.warn('[FormLayer] Failed to load form plugin:', err);
          }),
      );
    }
  }

  unregister(formId: string): void {
    const controller = this.forms.get(formId);
    if (!controller) return;

    // The onDestroy callback registered in register() removes it and emits `form:unregistered`.
    controller.destroy();
  }

  get(formId: string): FormControllerApi | undefined {
    return this.forms.get(formId);
  }

  getAll(): Map<string, FormControllerApi> {
    return new Map(this.forms);
  }

  on(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.eventBus.on(event, handler);
  }

  off(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.eventBus.off(event, handler);
  }

  registerFormPlugin(factory: FormPluginFactory): void {
    if (this._initialized) {
      console.warn('[FormLayer] registerFormPlugin called after init — new plugin will only apply to forms registered after this point');
    }
    this.formPluginFactories.push(factory);
  }
}

declare global {
  interface Window {
    __FormsModule?: FormRegistry;
  }
}

export const formRegistry = new FormRegistry();
if (typeof window !== 'undefined') {
  window.__FormsModule = formRegistry;
}
