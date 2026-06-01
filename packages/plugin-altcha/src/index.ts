import { registerFieldType } from 'formlayer';
import type { FormFieldFactory } from 'formlayer';

export { default as AltchaField } from './altcha';
export { default } from './altcha';

export const ALTCHA_FIELD_TYPE = 'altcha';

export const altchaFieldFactory: FormFieldFactory = () => import('./altcha');

/** Register the generic ALTCHA field type (`data-field-type="altcha"`). */
export function registerAltchaPlugin(type: string = ALTCHA_FIELD_TYPE): void {
  registerFieldType(type, altchaFieldFactory);
}
