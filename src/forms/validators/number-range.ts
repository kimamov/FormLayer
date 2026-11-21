import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const numberRange = defineValidator({
  type: 'NumberRange',
  options: { minimum: Number, maximum: Number },
  validate(input, { minimum = -Infinity, maximum = Infinity }) {
    const value = valueToString(input);
    if (value.length === 0) return VALID;
    const num = Number(value);
    if (Number.isNaN(num)) return invalid('Number', 'Please enter a valid number.');
    if (num < minimum) return invalid('NumberRange.tooLow', `The value must be at least ${minimum}.`, { minimum, maximum });
    if (num > maximum) return invalid('NumberRange.tooHigh', `The value must be at most ${maximum}.`, { minimum, maximum });
    return VALID;
  },
});
