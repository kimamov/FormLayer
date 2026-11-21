import { createAltchaField, findAltchaWidget } from './altcha-field-base';

/**
 * TYPO3-specific ALTCHA field for the `bbysaeth/typo3-altcha` extension.
 *
 * The Fluid partial renders a hidden input named like
 * `tx_form_formframework[form-1][field-id]` plus optional `<altcha-widget>`.
 * The verified payload is synced into that hidden input for form submission.
 */
const Typo3AltchaField = createAltchaField(({ wrapper, hiddenInput }) => {
  const name = wrapper.getAttribute('data-form-field') ?? '';
  const fromWidget = findAltchaWidget(wrapper, name)?.getAttribute('challenge');
  if (fromWidget) return fromWidget;

  return (
    wrapper.getAttribute('data-altcha-challenge')
    ?? hiddenInput.getAttribute('data-altcha-challenge')
    ?? wrapper.getAttribute('data-altcha-challenge-url')
  );
});

export default Typo3AltchaField;
