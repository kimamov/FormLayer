import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

export const stringLength: Validator = {
  type: 'StringLength',
  validate(input: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const value = valueToString(input);
    const min = Number(options['minimum'] ?? 0);
    const max = Number(options['maximum'] ?? Infinity);
    const customMsg = options.message as string | undefined;
    const len = value.length;

    if (len === 0) {
      return { valid: true, message: '' };
    }

    if (len < min) {
      return {
        valid: false,
        message: customMsg ?? `Must be at least ${min} characters.`,
      };
    }

    if (len > max) {
      return {
        valid: false,
        message: customMsg ?? `Must be at most ${max} characters.`,
      };
    }

    return { valid: true, message: '' };
  },
};
