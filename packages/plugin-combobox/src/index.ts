import { lazy, registerFieldType } from 'formlayer';
import type { FormFieldFactory } from 'formlayer';
import type { ComboboxOptions } from './combobox';

export { default as ComboboxField, createComboboxField, normalizeSearch } from './combobox';
export { default } from './combobox';
export type {
  ComboboxOptions,
  ComboboxOption,
  ComboboxOptionData,
  ComboboxGroupData,
  ComboboxMessages,
  ComboboxRenderHelpers,
} from './combobox';

export const COMBOBOX_FIELD_TYPE = 'combobox';

export const comboboxFieldFactory: FormFieldFactory = lazy(() => import('./combobox'));

export interface RegisterComboboxOptions extends ComboboxOptions {
  /** Field type to register (`data-field-type`). Default: `combobox`. */
  type?: string;
}

/**
 * Register the combobox field type (`data-field-type="combobox"`).
 *
 * ```ts
 * registerComboboxPlugin();
 * registerComboboxPlugin({
 *   renderOption: (option, { html }) => html`<span aria-hidden="true">${option.data.flag}</span> ${option.label}`,
 *   messages: { noResults: 'Keine Treffer' },
 * });
 * ```
 */
export function registerComboboxPlugin(options: string | RegisterComboboxOptions = {}): void {
  const { type = COMBOBOX_FIELD_TYPE, ...config } = typeof options === 'string' ? { type: options } : options;
  const configured = Object.keys(config).length > 0;
  registerFieldType(type, configured
    ? lazy(async () => ({ default: (await import('./combobox')).createComboboxField(config) }))
    : comboboxFieldFactory);
}
