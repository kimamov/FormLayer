import { AltchaFieldBase } from './altcha-field-base';

/**
 * TYPO3-specific ALTCHA field for the `bbysaeth/typo3-altcha` extension.
 *
 * The Fluid partial renders a hidden input with `data-altcha-challenge`
 * containing the challenge endpoint URL.
 */
export default class Typo3AltchaField extends AltchaFieldBase {
  protected resolveChallenge(): string | null {
    return this.hiddenInput.getAttribute('data-altcha-challenge');
  }
}
