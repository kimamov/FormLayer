import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

export const regularExpression = defineValidator({
  type: 'RegularExpression',
  options: { regularExpression: String },
  validate(input, { regularExpression }) {
    const value = valueToString(input);
    if (value.length === 0 || !regularExpression) return VALID;

    // TYPO3 stores patterns as PCRE delimited strings, e.g. '/^[a-z]+$/i'
    const match = regularExpression.match(/^\/(.+)\/([gimsuy]*)$/);
    if (!match) return VALID;

    try {
      return new RegExp(match[1], match[2]).test(value)
        ? VALID
        : invalid('RegularExpression', 'The value does not match the expected format.');
    } catch {
      return VALID;
    }
  },
});
