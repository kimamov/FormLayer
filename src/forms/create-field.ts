import { FieldController } from './field-controller';
import type { FieldControllerOptions } from './field-controller';
import type { FormField, FormFieldClass, FormFieldFactory } from './types';

/**
 * Maps `data-field-type` attribute values to custom FormField implementations.
 *
 * Each entry can be:
 *  - A `FormFieldClass` (constructor) — instantiated synchronously
 *  - A lazy factory `() => Promise<{ default: FormFieldClass }>` — loaded on
 *    first use via dynamic import, e.g. `() => import('./fields/combobox')`
 */
export type CustomFieldsMap = Record<string, FormFieldFactory>;

/**
 * A `FormFieldFactory` is either a class (sync) or a lazy loader (async).
 * We distinguish them by constructor arity: classes take a wrapper argument
 * (`fn.length >= 1`), lazy factories take none (`fn.length === 0`).
 */
export function isLazyFactory(factory: FormFieldFactory): factory is () => Promise<{ default: FormFieldClass }> {
  return typeof factory === 'function' && factory.length === 0;
}

export interface CreateFieldOptions {
  /** Explicit factory — takes priority over customFields lookup. */
  factory?: FormFieldFactory;
  /** Lookup map: if the wrapper has `data-field-type="x"`, use `customFields["x"]`. */
  customFields?: CustomFieldsMap;
  /** Options forwarded to FieldController (only used when no custom factory matches). */
  fieldOptions?: FieldControllerOptions;
}

/**
 * Resolve which factory to use for a given wrapper element.
 *
 * Priority order:
 *  1. `options.factory` (explicit override)
 *  2. `options.customFields[data-field-type]` (lookup by attribute)
 *  3. `undefined` (fall back to FieldController)
 */
function resolveFactory(wrapper: HTMLElement, options?: CreateFieldOptions): FormFieldFactory | undefined {
  if (options?.factory) return options.factory;

  const type = wrapper.getAttribute('data-field-type');
  if (type && options?.customFields?.[type]) return options.customFields[type];

  return undefined;
}

/**
 * Create a FormField synchronously.
 *
 * If a matching factory is found and it's a class, instantiates it directly.
 * If the factory is lazy, throws — use `createFieldAsync` instead.
 * If no factory matches, creates a default `FieldController`.
 */
export function createField(wrapper: HTMLElement, options?: CreateFieldOptions): FormField {
  const factory = resolveFactory(wrapper, options);

  if (!factory) {
    return new FieldController(wrapper, options?.fieldOptions ?? {});
  }

  if (isLazyFactory(factory)) {
    throw new Error('[FormsModule] Lazy field factory requires createFieldAsync()');
  }

  return new factory(wrapper);
}

/**
 * Create a FormField, resolving lazy factories via dynamic import.
 *
 * Works for both sync classes and `() => import(...)` factories.
 * Always returns a Promise for a uniform async API.
 */
export async function createFieldAsync(wrapper: HTMLElement, options?: CreateFieldOptions): Promise<FormField> {
  const factory = resolveFactory(wrapper, options);

  if (!factory) {
    return new FieldController(wrapper, options?.fieldOptions ?? {});
  }

  if (isLazyFactory(factory)) {
    const { default: Cls } = await factory();
    return new Cls(wrapper);
  }

  return new factory(wrapper);
}
