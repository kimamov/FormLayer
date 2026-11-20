import type { Validator, ValidatorResult } from '../types';

/**
 * TYPO3 `Count`: number of selected values (checkbox groups, multi-selects).
 * The field value is the comma-joined list of selected values.
 */
export const count: Validator = {
  type: 'Count',
  validate(value: string, options: Record<string, unknown>): ValidatorResult {
    const selected = value.split(',').filter((v) => v !== '').length;
    const min = Number(options['minimum'] ?? 0);
    const max = Number(options['maximum'] ?? Infinity);
    const customMsg = options.message as string | undefined;

    if (selected < min) {
      return {
        valid: false,
        message: customMsg ?? (min === 1 ? 'Choose at least one option.' : `Choose at least ${min} options.`),
      };
    }
    if (selected > max) {
      return {
        valid: false,
        message: customMsg ?? (max === 1 ? 'Choose no more than one option.' : `Choose no more than ${max} options.`),
      };
    }
    return { valid: true, message: '' };
  },
};
