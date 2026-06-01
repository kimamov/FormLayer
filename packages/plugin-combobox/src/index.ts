import { registerFieldType } from 'formlayer';
import type { FormFieldFactory } from 'formlayer';

export { default as ComboboxField } from './combobox';
export { default } from './combobox';

export const COMBOBOX_FIELD_TYPE = 'combobox';

export const comboboxFieldFactory: FormFieldFactory = () => import('./combobox');

/** Register the combobox field type (`data-field-type="combobox"`). */
export function registerComboboxPlugin(type: string = COMBOBOX_FIELD_TYPE): void {
  registerFieldType(type, comboboxFieldFactory);
}
