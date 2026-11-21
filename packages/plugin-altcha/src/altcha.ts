import { createAltchaField } from './altcha-field-base';

function parseMaybeJson(value: string): string | object {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

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
const AltchaField = createAltchaField(({ wrapper }) => {
  const jsonAttr = wrapper.getAttribute('data-altcha-challenge');
  if (jsonAttr) return parseMaybeJson(jsonAttr);

  const urlAttr = wrapper.getAttribute('data-altcha-challenge-url');
  if (urlAttr) return urlAttr;

  const challengeInput = wrapper.querySelector<HTMLInputElement>('input[type="hidden"][name$="[challenge]"]');
  if (challengeInput?.value) return parseMaybeJson(challengeInput.value);

  return null;
});

export default AltchaField;
