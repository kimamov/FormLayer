import { defineValidator, invalid, VALID } from '../validation';
import { isEmptyValue, valueToString } from '../field-value';

/** The value must equal another field's value (`options.field`), e.g. password confirmation. */
export const equals = defineValidator({
  type: 'Equals',
  options: { field: String },
  validate(value, { field }, ctx) {
    if (!field || isEmptyValue(value)) return VALID;
    const other = ctx.form.getValue(field);
    if (other === undefined) return VALID;
    return valueToString(value) === valueToString(other)
      ? VALID
      : invalid('Equals', 'The values don’t match.', { field });
  },
});

/** A date (`YYYY-MM-DD` or any parseable date) must not be before another field's date (`options.field`). */
export const dateNotBefore = defineValidator({
  type: 'DateNotBefore',
  options: { field: String },
  validate(value, { field }, ctx) {
    const own = valueToString(value);
    const other = field ? ctx.form.getValue(field) : undefined;
    if (!own || other === undefined || isEmptyValue(other)) return VALID;
    const a = new Date(own).getTime();
    const b = new Date(valueToString(other)).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return VALID;
    return a >= b ? VALID : invalid('DateNotBefore', 'Choose a later date.', { field });
  },
});

/** Form-level rule: at least one of `options.fields` must have a value. */
export const atLeastOne = defineValidator({
  type: 'AtLeastOne',
  options: { fields: Array },
  validate(_value, { fields = [] }, ctx) {
    if (fields.length === 0) return VALID;
    const filled = fields.some((name) => {
      const v = ctx.form.getValue(name);
      return v !== undefined && !isEmptyValue(v);
    });
    return filled ? VALID : invalid('AtLeastOne', `Fill in at least one of: ${fields.join(', ')}.`, { fields: fields.join(', ') });
  },
});
