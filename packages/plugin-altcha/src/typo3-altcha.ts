import { AltchaFieldBase } from './altcha-field-base';

/**
 * TYPO3-specific ALTCHA field for the `bbysaeth/typo3-altcha` extension.
 *
 * The Fluid partial renders `<altcha-widget challenge="...">` inside the field
 * wrapper. A hidden input is created by the widget on verify, or by the base
 * class as a placeholder for form state.
 */
export default class Typo3AltchaField extends AltchaFieldBase {
  protected resolveChallenge(): string | null {
    const widget = this.findAltchaWidget();
    const fromWidget = widget?.getAttribute('challenge');
    if (fromWidget) return fromWidget;

    return (
      this.wrapper.getAttribute('data-altcha-challenge')
      ?? this.hiddenInput.getAttribute('data-altcha-challenge')
      ?? this.wrapper.getAttribute('data-altcha-challenge-url')
    );
  }
}
