import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

export const alphanumeric: Validator = {
  type: 'Alphanumeric',
  validate(input: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const value = valueToString(input);
    if (value.length === 0) {
      return { valid: true, message: '' };
    }

    const valid = /^[\p{L}\p{N}]*$/u.test(value);
    return {
      valid,
      message: valid ? '' : (options.message as string) ?? 'Only letters and numbers are allowed.',
    };
  },
};
