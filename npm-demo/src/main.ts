import './style.css';
import 'formlayer/forms.css';

import { initTypo3Forms } from 'formlayer/typo3';
import { registerComboboxPlugin } from 'formlayer-plugin-combobox';
import { registerClientVariantsPlugin } from 'formlayer-plugin-client-variants';
import { registerDatepickerPlugin } from 'formlayer-plugin-datepicker';
import { registerTypo3AltchaPlugin } from 'formlayer-plugin-altcha/typo3';

registerComboboxPlugin();
registerClientVariantsPlugin();
registerDatepickerPlugin();
registerTypo3AltchaPlugin();

const api = initTypo3Forms();

export { api };
