import { registerFieldType } from 'formlayer';
import type { FormFieldFactory } from 'formlayer';

export { default as DatePickerField } from './datepicker';
export { default } from './datepicker';

export const DATEPICKER_FIELD_TYPE = 'datepicker';

export const datepickerFieldFactory: FormFieldFactory = () => import('./datepicker');

/** Register the datepicker field type (`data-field-type="datepicker"`). */
export function registerDatepickerPlugin(type: string = DATEPICKER_FIELD_TYPE): void {
  registerFieldType(type, datepickerFieldFactory);
}
