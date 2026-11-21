import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const number = defineValidator({
  type: 'Number',
  validate(input) {
    const value = valueToString(input).trim();
    if (value.length === 0 || !Number.isNaN(Number(value))) return VALID;
    return invalid('Number', 'Please enter a valid number.');
  },
});
