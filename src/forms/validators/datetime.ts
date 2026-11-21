import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const dateTime = defineValidator({
  type: 'DateTime',
  validate(input) {
    const value = valueToString(input);
    if (value.length === 0 || !Number.isNaN(new Date(value).getTime())) return VALID;
    return invalid('DateTime', 'Please enter a valid date.');
  },
});
