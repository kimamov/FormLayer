import { registerPlugin } from 'formlayer';
import type { FieldPluginFactory } from 'formlayer';

export { default as Typo3AltchaPlugin } from './typo3-altcha';
export { default } from './typo3-altcha';

export const ALTCHA_PLUGIN_TYPE = 'altcha';

export const typo3AltchaPluginFactory: FieldPluginFactory = () => import('./typo3-altcha');

/** Register the TYPO3 ALTCHA field plugin (`data-field-type="altcha"`). */
export function registerTypo3AltchaPlugin(type: string = ALTCHA_PLUGIN_TYPE): void {
  registerPlugin(type, typo3AltchaPluginFactory);
}
