import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const stringLength = defineValidator({
  type: 'StringLength',
  options: { minimum: Number, maximum: Number },
  validate(input, { minimum = 0, maximum = Infinity }) {
    const len = valueToString(input).length;
    if (len === 0) return VALID;
    if (len < minimum) return invalid('StringLength.tooShort', `Must be at least ${minimum} characters.`, { minimum, maximum });
    if (len > maximum) return invalid('StringLength.tooLong', `Must be at most ${maximum} characters.`, { minimum, maximum });
    return VALID;
  },
});
