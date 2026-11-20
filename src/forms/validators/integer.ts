import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

export const integer: Validator = {
  type: 'Integer',
  validate(input: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const value = valueToString(input);
    if (value.length === 0) {
      return { valid: true, message: '' };
    }

    const valid = /^-?\d+$/.test(value.trim());
    return {
      valid,
      message: valid ? '' : (options.message as string) ?? 'Please enter a whole number.',
    };
  },
};
