import type {
  FormControllerApi,
  FormPluginClass,
  FormPluginFactory,
  FormPluginSource,
  FormSubmitFunction,
  RegistryEventHandler,
  RegistryEventType,
} from './types';
import { SELECTORS } from './types';
import { FormController } from './form-controller';
import type { FormControllerOptions } from './form-controller';
import { EventBus } from './events';
import { isClassLike } from './create-field';

export interface RegistryInitArguments {
  submitFn: FormSubmitFunction;
  root?: ParentNode;
  /** Which forms to enhance. Default `form`; forms without any field wrapper are skipped. */
  formSelector?: string;
  controllerOptions?: FormControllerOptions;
}

function isPluginClass(source: FormPluginSource): source is FormPluginClass {
  return typeof source === 'function' && isClassLike(source);
}

export class FormRegistry {
  private readonly forms = new Map<string, FormController>();
  private readonly byElement = new WeakMap<HTMLFormElement, FormController>();
  private readonly plugins: Array<{ source: FormPluginSource; options?: unknown }> = [];
  private readonly eventBus = new EventBus();
  private _initialized = false;

  init({
    submitFn,
    root = document,
    formSelector = 'form',
    controllerOptions,
  }: RegistryInitArguments): void {
    this._initialized = true;
    const fieldSelector = controllerOptions?.fieldSelector ?? SELECTORS.formField;
    root.querySelectorAll<HTMLFormElement>(formSelector).forEach((formEl) => {
      // Forms without fields (search, newsletter, …) are left alone.
      if (!formEl.querySelector(fieldSelector)) return;
      this.register(formEl, submitFn, controllerOptions);
    });
  }

  /** Enhance a form (idempotent per element). Forms without an `id` get a generated one. */
  register(formEl: HTMLFormElement, submitFn: FormSubmitFunction, controllerOptions?: FormControllerOptions): FormControllerApi {
    const existing = this.byElement.get(formEl);
    if (existing) return existing;

    const controller = new FormController(formEl, submitFn, controllerOptions);
    const formId = controller.id;
    this.byElement.set(formEl, controller);
    this.forms.set(formId, controller);

    // Unregister however the controller ends: unregister(), finish() or a replace.
    controller.onDestroy(() => {
      this.byElement.delete(formEl);
      if (this.forms.get(formId) !== controller) return;
      this.forms.delete(formId);
      this.eventBus.emit('form:unregistered', { formId });
    });
    // A form replaced by new markup (multistep) is registered again with the same options.
    controller.setReplaceHandler((newFormEl) => this.register(newFormEl, submitFn, controllerOptions));

    this.attachPlugins(controller);
    this.eventBus.emit('form:registered', { formId });
    return controller;
  }

  private attachPlugins(controller: FormController): void {
    for (const { source, options } of this.plugins) {
      if (isPluginClass(source)) {
        // Plugin classes attach synchronously, before first paint.
        void controller.attachFormPlugin(new source(options)).catch((err) => {
          console.warn('[FormLayer] Form plugin failed to initialise:', err);
        });
        continue;
      }
      controller.track(
        (source as FormPluginFactory)()
          .then(({ default: PluginClass }) => controller.attachFormPlugin(new PluginClass(options)))
          .catch((err) => {
            console.warn('[FormLayer] Failed to load form plugin:', err);
          }),
      );
    }
  }

  unregister(form: string | HTMLFormElement): void {
    // The onDestroy callback registered in register() removes it and emits `form:unregistered`.
    this.resolve(form)?.destroy();
  }

  /** The controller for a form, by id (generated ids included) or by element. */
  get(form: string | HTMLFormElement): FormControllerApi | undefined {
    return this.resolve(form);
  }

  getAll(): Map<string, FormControllerApi> {
    return new Map(this.forms);
  }

  on(event: RegistryEventType, handler: RegistryEventHandler): () => void {
    return this.eventBus.on(event, handler);
  }

  off(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.eventBus.off(event, handler);
  }

  /**
   * Add a plugin to every form registered from now on. Pass a plugin class
   * (constructed per form with `options`, attached immediately) or a lazy
   * module loader (`() => import('./plugin')`).
   */
  registerFormPlugin<O = unknown>(source: FormPluginClass<O> | FormPluginFactory, options?: O): void {
    if (this._initialized) {
      console.warn('[FormLayer] registerFormPlugin called after init — new plugin will only apply to forms registered after this point');
    }
    this.plugins.push({ source: source as FormPluginSource, options });
  }

  private resolve(form: string | HTMLFormElement): FormController | undefined {
    return typeof form === 'string' ? this.forms.get(form) : this.byElement.get(form);
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
