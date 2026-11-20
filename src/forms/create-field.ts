import { FieldController } from './field-controller';
import { AbstractDomFormField } from './abstract-dom-field';
import type { FormField, FormFieldClass, FormFieldFactory } from './types';
import type { FieldOptions } from './field-options';

/**
 * Maps `data-field-type` attribute values to custom FormField implementations.
 *
 * Each entry can be:
 *  - A `FormFieldClass` (constructor) — instantiated synchronously
 *  - A lazy factory `() => Promise<{ default: FormFieldClass }>` — loaded on
 *    first use via dynamic import, e.g. `() => import('./fields/combobox')`
 */
export type CustomFieldsMap = Record<string, FormFieldFactory>;

export interface AddFieldFromElementOptions extends FieldOptions {
  field?: FormFieldFactory;
}

const LAZY_MARKER = Symbol.for('formlayer.lazyField');

export type LazyFieldLoader = () => Promise<{ default: FormFieldClass }>;

/**
 * Mark a loader as a lazy field factory, e.g. `lazy(() => import('./fields/rating'))`.
 * The field class is loaded on first use (code splitting).
 */
export function lazy(loader: LazyFieldLoader): LazyFieldLoader {
  const marked: LazyFieldLoader = () => loader();
  Object.defineProperty(marked, LAZY_MARKER, { value: true });
  return marked;
}

/** True for `class` declarations and constructor functions with prototype methods. */
function isClassLike(fn: Function): boolean {
  if (/^class[\s{]/.test(Function.prototype.toString.call(fn))) return true;
  const proto = (fn as { prototype?: object }).prototype;
  return !!proto && Object.getOwnPropertyNames(proto).length > 1;
}

/**
 * A `FormFieldFactory` is either a field class (sync) or a lazy loader (async).
 *
 * Loaders wrapped with {@link lazy} are always lazy and classes never are.
 * Unmarked zero-argument functions (`() => import('./x')`) are still treated
 * as lazy loaders for backwards compatibility. Checking only the arity is not
 * enough: a subclass without its own constructor also has `length === 0`.
 */
export function isLazyFactory(factory: FormFieldFactory): factory is LazyFieldLoader {
  if (typeof factory !== 'function') return false;
  if ((factory as unknown as Record<symbol, unknown>)[LAZY_MARKER] === true) return true;
  if (isClassLike(factory)) return false;
  return factory.length === 0;
}

export interface CreateFieldOptions {
  /** Explicit factory — takes priority over customFields lookup. */
  factory?: FormFieldFactory;
  /** Lookup map: if the wrapper has `data-field-type="x"`, use `customFields["x"]`. */
  customFields?: CustomFieldsMap;
  /** Options passed to the field constructor. */
  fieldOptions?: FieldOptions;
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

function fieldOpts(options?: CreateFieldOptions): FieldOptions {
  return options?.fieldOptions ?? {};
}

/**
 * Run the deferred {@link AbstractDomFormField.init} step after construction.
 * Internal to the field-creation paths — keeps `mount()` out of the
 * constructor so subclass class fields exist before it runs.
 */
export function finalizeField(field: FormField): FormField {
  if (field instanceof AbstractDomFormField) {
    field.init();
  }
  return field;
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
  const opts = fieldOpts(options);

  if (!factory) {
    return new FieldController(wrapper, opts);
  }

  if (isLazyFactory(factory)) {
    throw new Error('[FormLayer] Lazy field factory requires createFieldAsync()');
  }

  return finalizeField(new factory(wrapper, opts));
}

/**
 * Create a FormField, resolving lazy factories via dynamic import.
 *
 * Works for both sync classes and `() => import(...)` factories.
 * Always returns a Promise for a uniform async API.
 */
export async function createFieldAsync(wrapper: HTMLElement, options?: CreateFieldOptions): Promise<FormField> {
  const factory = resolveFactory(wrapper, options);
  const opts = fieldOpts(options);

  if (!factory) {
    return new FieldController(wrapper, opts);
  }

  if (isLazyFactory(factory)) {
    const { default: Cls } = await factory();
    return finalizeField(new Cls(wrapper, opts));
  }

  return finalizeField(new factory(wrapper, opts));
}
