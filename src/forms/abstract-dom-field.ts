import { BaseField, type FieldAdapter, type FieldContext, type FormControl } from './base-field';
import type { FieldOptions } from './field-options';
import { valueToString } from './field-value';

export type AbstractDomFieldOptions = FieldOptions;

/**
 * @deprecated Write new fields with `defineField()`. This class stays for one
 * minor version as a thin layer over the shared field core; existing
 * subclasses keep working unchanged.
 *
 * Lifecycle: the field factories (`createField`, `initField`, `fieldsMap`)
 * construct the subclass, then call `init()`, which runs {@link mount}.
 */
export abstract class AbstractDomFormField extends BaseField {
  /** Subclass hook: build custom DOM and call {@link setControlElement}. */
  protected abstract mount(): void;

  /** Subclass hook: read the canonical string value from the DOM. */
  protected abstract readValue(): string;

  /** Subclass hook: write a string value back to the DOM. */
  protected abstract writeValue(value: string): void;

  /** Subclass hook: focus the interactive control. Defaults to {@link inputElement}. */
  protected focusControl(): void {
    this.inputElement.focus();
  }

  /** Subclass hook: restore DOM to initial values during {@link reset}. */
  protected onReset(): void {}

  /** Subclass hook: tear down custom DOM during {@link destroy}. */
  protected onDestroy(): void {}

  /** Set the active control used for focus, validation UI, and aria attributes. */
  protected setControlElement(element: HTMLElement): void {
    this.setControlTargets(element);
  }

  /** The active control (set with {@link setControlElement}). */
  protected get input(): FormControl {
    return this.inputElement as FormControl;
  }

  protected createAdapter(_ctx: FieldContext): FieldAdapter {
    this.mount();
    return {
      read: () => this.readValue(),
      write: (value) => this.writeValue(valueToString(value)),
      focus: () => this.focusControl(),
      reset: () => this.onReset(),
      destroy: () => this.onDestroy(),
    };
  }
}
