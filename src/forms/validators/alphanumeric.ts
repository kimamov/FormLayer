import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const alphanumeric = defineValidator({
  type: 'Alphanumeric',
  validate(input) {
    const value = valueToString(input);
    if (value.length === 0 || /^[\p{L}\p{N}]*$/u.test(value)) return VALID;
    return invalid('Alphanumeric', 'Only letters and numbers are allowed.');
  },
});
