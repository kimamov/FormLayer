import { formRegistry } from 'formlayer';
import type { FormPluginFactory } from 'formlayer';
import ClientVariantsPlugin from './client-variants-plugin';

export { default as ClientVariantsPlugin } from './client-variants-plugin';
export { evaluateExpression } from './expression-parser';
export { default } from './client-variants-plugin';

/** Lazy loader, for setups that code-split the plugin (conditions then apply after load). */
export const clientVariantsPluginFactory: FormPluginFactory = () => import('./client-variants-plugin');

export interface RegisterClientVariantsOptions {
  /**
   * Load the plugin lazily. Default `false`: the plugin attaches synchronously
   * and hides conditional fields before first paint. With `true`, add the CSS
   * fallback `[data-client-variants]:not([data-fl-evaluated]) { visibility: hidden }`.
   */
  lazy?: boolean;
}

/** Register the client variants form plugin (`data-client-variants` on fields and containers). */
export function registerClientVariantsPlugin(options: RegisterClientVariantsOptions = {}): void {
  formRegistry.registerFormPlugin(options.lazy ? clientVariantsPluginFactory : ClientVariantsPlugin);
}
