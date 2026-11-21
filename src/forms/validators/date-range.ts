import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

const parse = (s: string | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const dateRange = defineValidator({
  type: 'DateRange',
  options: { minimum: String, maximum: String },
  validate(input, { minimum, maximum }) {
    const value = valueToString(input);
    if (value.length === 0) return VALID;
    const date = parse(value);
    if (!date) return invalid('DateTime', 'Please enter a valid date.');
    const min = parse(minimum);
    if (min && date < min) return invalid('DateRange.tooEarly', `The date must not be before ${minimum}.`, { minimum, maximum });
    const max = parse(maximum);
    if (max && date > max) return invalid('DateRange.tooLate', `The date must not be after ${maximum}.`, { minimum, maximum });
    return VALID;
  },
});
