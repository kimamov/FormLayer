import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const integer = defineValidator({
  type: 'Integer',
  validate(input) {
    const value = valueToString(input);
    if (value.length === 0 || /^-?\d+$/.test(value.trim())) return VALID;
    return invalid('Integer', 'Please enter a whole number.');
  },
});
