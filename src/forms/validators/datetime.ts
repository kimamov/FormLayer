import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

export const dateTime: Validator = {
  type: 'DateTime',
  validate(input: FieldValue): ValidatorResult {
    const value = valueToString(input);
    if (value.length === 0) {
      return { valid: true, message: '' };
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { valid: false, message: 'Please enter a valid date.' };
    }

    return { valid: true, message: '' };
  },
};
