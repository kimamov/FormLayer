import type { FieldPlugin, FormField, FormFieldClass, FormFieldFactory } from './types';
import { FieldController } from './field-controller';
import type { FieldControllerOptions } from './field-controller';
import { isLazyFactory } from './create-field';

export type PluginArg =
  | string                       // registry key, e.g. "combobox"
  | (new () => FieldPlugin)      // class reference, e.g. ComboboxPlugin
  | FieldPlugin;                 // pre-built instance

export interface InitFieldOptions extends FieldControllerOptions {
  field?: FormFieldClass
}

/**
 * Initialize a standalone field (outside of a FormController).
 *
 * Pass a `[data-form-field]` wrapper, or a bare input/select/textarea
 * (the closest `[data-form-field]` ancestor is used automatically).
 *
 * ```ts
 * // Default FieldController
 * const field = initField(wrapper);
 *
 * // Custom FormField implementation
 * const field = initField(wrapper, { field: ImageInputField });
 *
 * // With FieldController options (validate, renderErrors, etc.)
 * const field = initField(wrapper, { validate: myValidator });
 * ```
 */
export function initField(element: HTMLElement, options?: InitFieldOptions): FormField {
  const wrapper = resolveWrapper(element);
  const { field: FieldClass, ...fieldOptions } = options ?? {};

  if (FieldClass) {
    return new FieldClass(wrapper);
  }

  return new FieldController(wrapper, fieldOptions);
}

/**
 * Initialize a standalone field from a lazy factory (code-split).
 *
 * ```ts
 * const field = await initFieldAsync(wrapper, () => import('./fields/image-input'));
 * ```
 */
export async function initFieldAsync(
  element: HTMLElement,
  factory: FormFieldFactory,
): Promise<FormField> {
  const wrapper = resolveWrapper(element);

  if (isLazyFactory(factory)) {
    const { default: Cls } = await factory();
    return new Cls(wrapper);
  }

  return new factory(wrapper);
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
