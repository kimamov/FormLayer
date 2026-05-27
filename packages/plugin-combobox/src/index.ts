import { registerPlugin } from 'formlayer';
import type { FieldPluginFactory } from 'formlayer';

export { default as ComboboxPlugin } from './combobox';
export { default } from './combobox';

export const COMBOBOX_PLUGIN_TYPE = 'combobox';

export const comboboxPluginFactory: FieldPluginFactory = () => import('./combobox');

/** Register the combobox field plugin (`data-field-type="combobox"`). */
export function registerComboboxPlugin(type: string = COMBOBOX_PLUGIN_TYPE): void {
  registerPlugin(type, comboboxPluginFactory);
}
