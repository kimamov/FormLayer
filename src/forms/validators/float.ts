import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const float = defineValidator({
  type: 'Float',
  validate(input) {
    const value = valueToString(input).trim();
    if (value.length === 0 || !Number.isNaN(Number(value))) return VALID;
    return invalid('Float', 'Please enter a valid number.');
  },
});
