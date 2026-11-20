import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

export const float: Validator = {
  type: 'Float',
  validate(input: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const value = valueToString(input);
    if (value.length === 0) {
      return { valid: true, message: '' };
    }

    const valid = !Number.isNaN(Number(value.trim())) && value.trim() !== '';
    return {
      valid,
      message: valid ? '' : (options.message as string) ?? 'Please enter a valid number.',
    };
  },
};
