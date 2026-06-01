import { AltchaFieldBase } from './altcha-field-base';

/**
 * Generic ALTCHA field for custom backends.
 *
 * Expected HTML structure:
 *   <div data-form-field="altcha-1" data-field-type="altcha">
 *     <input type="hidden" name="altcha-1" value="">
 *     <!-- Optional: data-altcha-challenge='{"parameters":{...},"signature":"..."}' -->
 *     <!-- Optional: data-altcha-challenge-url="https://..." -->
 *   </div>
 */
export default class AltchaField extends AltchaFieldBase {
  protected resolveChallenge(): string | object | null {
    const jsonAttr = this.wrapper.getAttribute('data-altcha-challenge');
    if (jsonAttr) {
      try {
        return JSON.parse(jsonAttr);
      } catch {
        return jsonAttr;
      }
    }

    const urlAttr = this.wrapper.getAttribute('data-altcha-challenge-url');
    if (urlAttr) return urlAttr;

    const hiddenInput = this.wrapper.querySelector<HTMLInputElement>(
      'input[type="hidden"][name$="[challenge]"]',
    );
    if (hiddenInput?.value) {
      try {
        return JSON.parse(hiddenInput.value);
      } catch {
        return hiddenInput.value;
      }
    }

    return null;
  }
}
