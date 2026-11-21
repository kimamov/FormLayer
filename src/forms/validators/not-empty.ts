import { defineValidator, invalid, VALID } from '../validation';
import { isEmptyValue } from '../field-value';

export const notEmpty = defineValidator({
  type: 'NotEmpty',
  validate(value) {
    return isEmptyValue(value) ? invalid('NotEmpty', 'This field is required.') : VALID;
  },
});
