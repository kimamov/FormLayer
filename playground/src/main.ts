/**
 * Shared playground entry: the setup a TYPO3 integrator would ship.
 * Scenario-specific integrator code lives in ./integrator/ and is loaded per page.
 */
import { initTypo3Forms } from 'formlayer/typo3';
import { registerComboboxPlugin } from 'formlayer-plugin-combobox';
import { registerClientVariantsPlugin } from 'formlayer-plugin-client-variants';
import 'formlayer/base.css';
import 'formlayer/theme.css';
import 'formlayer-plugin-combobox/style.css';
import './playground.css';
import { mountDebugPanel } from './debug-panel';

registerComboboxPlugin();
registerClientVariantsPlugin();

// Server validation uses the built-in TYPO3 transport; forms opt in with
// data-server-validation="client+server" or "server".
const { registry } = initTypo3Forms();
mountDebugPanel(registry);
