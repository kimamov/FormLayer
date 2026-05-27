import { formRegistry } from 'formlayer';
import type { FormPluginFactory } from 'formlayer';

export { default as ClientVariantsPlugin } from './client-variants-plugin';
export { evaluateExpression } from './expression-parser';
export { default } from './client-variants-plugin';

export const clientVariantsPluginFactory: FormPluginFactory = () => import('./client-variants-plugin');

/** Register the client variants form plugin (reads `data-client-variants` on field wrappers). */
export function registerClientVariantsPlugin(): void {
  formRegistry.registerFormPlugin(clientVariantsPluginFactory);
}
