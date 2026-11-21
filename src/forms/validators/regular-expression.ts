import type { FieldValue, Validator, ValidatorResult } from '../types';
import { valueToString } from '../field-value';

export const regularExpression: Validator = {
  type: 'RegularExpression',
  validate(input: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const value = valueToString(input);
    if (value.length === 0) {
      return { valid: true, message: '' };
    }

    const pattern = String(options['regularExpression'] ?? '');
    if (!pattern) {
      return { valid: true, message: '' };
    }

    // TYPO3 stores patterns as PCRE delimited strings, e.g. '/^[a-z]+$/i'
    const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
    if (!match) {
      return { valid: true, message: '' };
    }

    try {
      const re = new RegExp(match[1], match[2]);
      const valid = re.test(value);
      return {
        valid,
        message: valid ? '' : (options.message as string) ?? 'The value does not match the expected format.',
      };
    } catch {
      return { valid: true, message: '' };
    }
  },
};
