import { defineValidator, invalid, VALID } from '../validation';
import { valueToString } from '../field-value';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailAddress = defineValidator({
  type: 'EmailAddress',
  validate(input) {
    const value = valueToString(input);
    if (value.length === 0 || EMAIL_RE.test(value)) return VALID;
    return invalid('EmailAddress', 'Please enter a valid email address.');
  },
});
