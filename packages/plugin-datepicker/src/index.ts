import { registerPlugin } from 'formlayer';
import type { FieldPluginFactory } from 'formlayer';

export { default as DatePickerPlugin } from './datepicker';
export { default } from './datepicker';

export const DATEPICKER_PLUGIN_TYPE = 'datepicker';

export const datepickerPluginFactory: FieldPluginFactory = () => import('./datepicker');

/** Register the datepicker field plugin (`data-field-type="datepicker"`). */
export function registerDatepickerPlugin(type: string = DATEPICKER_PLUGIN_TYPE): void {
  registerPlugin(type, datepickerPluginFactory);
}
