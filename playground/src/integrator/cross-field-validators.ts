/**
 * Integrator workaround for cross-field rules with today's validator API.
 *
 * Validators only receive `(value, options)`, so these read the other field
 * straight from the DOM. Limitations this exposes:
 * - the dependent field is not re-validated when the other field changes;
 * - form-level rules ("phone OR backup email") cannot be expressed at all.
 */
import { registerValidator } from 'formlayer';

const valueOf = (name: string) =>
  document.querySelector<HTMLInputElement>(`[data-form-field="${name}"] input`)?.value ?? '';

registerValidator({
  type: 'Equals',
  validate(value, options) {
    const valid = value === '' || value === valueOf(String(options.field));
    return { valid, message: valid ? '' : String(options.message ?? 'The values don’t match.') };
  },
});

registerValidator({
  type: 'DateNotBefore',
  validate(value, options) {
    const other = valueOf(String(options.field));
    const valid = value === '' || other === '' || value >= other;
    return { valid, message: valid ? '' : String(options.message ?? 'Choose a later date.') };
  },
});
