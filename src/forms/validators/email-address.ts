import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailAddress: Validator = {
  type: 'EmailAddress',
  validate(input: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const value = valueToString(input);
    if (value.length === 0) {
      return { valid: true, message: '' };
    }

    const valid = EMAIL_RE.test(value);
    return {
      valid,
      message: valid ? '' : (options.message as string) ?? 'Please enter a valid email address.',
    };
  },
};
