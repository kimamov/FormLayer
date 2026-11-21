import type { FieldValue, Validator, ValidatorResult } from '../types';
import { isEmptyValue } from '../field-value';

export const notEmpty: Validator = {
  type: 'NotEmpty',
  validate(value: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const valid = !isEmptyValue(value);
    return {
      valid,
      message: valid ? '' : (options.message as string) ?? 'This field is required.',
    };
  },
};
