import { registerFieldType } from 'formlayer';
import type { FormFieldFactory } from 'formlayer';

export { default as Typo3AltchaField } from './typo3-altcha';
export { default } from './typo3-altcha';

export const ALTCHA_FIELD_TYPE = 'altcha';

export const typo3AltchaFieldFactory: FormFieldFactory = () => import('./typo3-altcha');

/** Register the TYPO3 ALTCHA field type (`data-field-type="altcha"`). */
export function registerTypo3AltchaPlugin(type: string = ALTCHA_FIELD_TYPE): void {
  registerFieldType(type, typo3AltchaFieldFactory);
}
