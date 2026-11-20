import { BaseField, type FieldAdapter, type FieldContext } from './base-field';
import type { FieldOptions } from './field-options';

export interface FieldDefinition {
  /**
   * Build the field: find or create its DOM, attach listeners with
   * `{ signal: ctx.signal }`, report user interaction through `ctx.input()`,
   * `ctx.commit()` and `ctx.touch()`, and return how to read and write the value.
   */
  setup(ctx: FieldContext): FieldAdapter;
}

/** A field class created by {@link defineField}. Register it with `registerFieldType()`. */
export type DefinedFieldClass = new (wrapper: HTMLElement, options?: FieldOptions) => BaseField;

/**
 * Define a custom field type.
 *
 * ```ts
 * export default defineField({
 *   setup(ctx) {
 *     const input = ctx.control<HTMLInputElement>();
 *     input.addEventListener('input', () => ctx.input(), { signal: ctx.signal });
 *     input.addEventListener('blur', () => ctx.touch(), { signal: ctx.signal });
 *     return {
 *       read: () => input.value,
 *       write: (value) => { input.value = String(value); },
 *     };
 *   },
 * });
 * ```
 */
export function defineField(definition: FieldDefinition): DefinedFieldClass {
  return class DefinedField extends BaseField {
    constructor(wrapper: HTMLElement, options?: FieldOptions) {
      super(wrapper, options);
      this.init();
    }

    protected createAdapter(ctx: FieldContext): FieldAdapter {
      return definition.setup(ctx);
    }
  };
}
