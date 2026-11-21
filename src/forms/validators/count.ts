import { defineValidator, invalid, VALID } from '../validation';

/**
 * TYPO3 `Count`: number of selected values (checkbox groups, multi-selects).
 * Array values are counted directly; a string is treated as a comma-joined list
 * (custom fields that report their selection as one string).
 */
export const count = defineValidator({
  type: 'Count',
  options: { minimum: Number, maximum: Number },
  validate(value, { minimum = 0, maximum = Infinity }) {
    const selected = Array.isArray(value) ? value.length : value.split(',').filter((v) => v !== '').length;
    if (selected < minimum) {
      return invalid('Count.tooFew', minimum === 1 ? 'Choose at least one option.' : `Choose at least ${minimum} options.`, { minimum, maximum });
    }
    if (selected > maximum) {
      return invalid('Count.tooMany', maximum === 1 ? 'Choose no more than one option.' : `Choose no more than ${maximum} options.`, { minimum, maximum });
    }
    return VALID;
  },
});
