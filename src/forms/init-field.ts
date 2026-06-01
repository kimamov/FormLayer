import type { FormField, FormFieldClass, FormFieldFactory } from './types';
import { FieldController } from './field-controller';
import type { FieldOptions } from './field-options';
import { isLazyFactory } from './create-field';

export interface InitFieldOptions extends FieldOptions {
  /** Explicit custom field class. Does not use fieldsMap or data-field-type lookup. */
  field?: FormFieldClass;
}

/**
 * Initialize a standalone field (outside of a FormController or registry).
 *
 * Pass a `[data-form-field]` wrapper, or a bare input/select/textarea
 * (the closest `[data-form-field]` ancestor is used automatically).
 *
 * This is intentionally separate from the form path: no registry, no fieldsMap,
 * and no automatic `data-field-type` resolution. Pass `{ field: MyField }` explicitly
 * for custom field types.
 *
 * ```ts
 * // Default FieldController
 * const field = initField(wrapper);
 *
 * // Custom FormField implementation
 * const field = initField(wrapper, { field: ComboboxField });
 *
 * // With field options (validate, renderErrors, etc.)
 * const field = initField(wrapper, { validate: myValidator });
 * ```
 */
export function initField(element: HTMLElement, options?: InitFieldOptions): FormField {
  const wrapper = resolveWrapper(element);
  const { field: FieldClass, ...fieldOptions } = options ?? {};

  if (FieldClass) {
    return new FieldClass(wrapper, fieldOptions);
  }

  return new FieldController(wrapper, fieldOptions);
}

/**
 * Initialize a standalone field from a lazy factory (code-split).
 *
 * ```ts
 * const field = await initFieldAsync(wrapper, () => import('./fields/image-input'));
 * const field = await initFieldAsync(wrapper, () => import('./fields/image-input'), { validate: fn });
 * ```
 */
export async function initFieldAsync(
  element: HTMLElement,
  factory: FormFieldFactory,
  options?: FieldOptions,
): Promise<FormField> {
  const wrapper = resolveWrapper(element);
  const opts = options ?? {};

  if (isLazyFactory(factory)) {
    const { default: Cls } = await factory();
    return new Cls(wrapper, opts);
  }

  return new factory(wrapper, opts);
}

const INPUT_SELECTOR = 'input, select, textarea';

/** Accept either a `[data-form-field]` wrapper or a bare input inside one. */
function resolveWrapper(element: HTMLElement): HTMLElement {
  if (element.hasAttribute('data-form-field')) return element;

  if (element.matches(INPUT_SELECTOR)) {
    const parent = element.closest<HTMLElement>('[data-form-field]');
    if (parent) return parent;
  }

  throw new Error(
    '[FormsModule] initField() expects a [data-form-field] wrapper or an input inside one.',
  );
}
