import { registerPlugin } from 'formlayer';
import type { FieldPluginFactory } from 'formlayer';

export { default as AltchaPlugin } from './altcha';
export { default } from './altcha';

export const ALTCHA_PLUGIN_TYPE = 'altcha';

export const altchaPluginFactory: FieldPluginFactory = () => import('./altcha');

/** Register the generic ALTCHA field plugin (`data-field-type="altcha"`). */
export function registerAltchaPlugin(type: string = ALTCHA_PLUGIN_TYPE): void {
  registerPlugin(type, altchaPluginFactory);
}
