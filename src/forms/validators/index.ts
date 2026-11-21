import type { FieldValue, Validator, ValidatorRule, ValidatorResult } from '../types';
import { detachedContext, type ValidatorContext } from '../validation';
import { notEmpty } from './not-empty';
import { stringLength } from './string-length';
import { emailAddress } from './email-address';
import { regularExpression } from './regular-expression';
import { numberRange } from './number-range';
import { integer } from './integer';
import { float } from './float';
import { alphanumeric } from './alphanumeric';
import { number } from './number';
import { dateTime } from './datetime';
import { dateRange } from './date-range';
import { fileSize } from './file-size';
import { count } from './count';
import { mimeType } from './mime-type';
import { equals, dateNotBefore, atLeastOne } from './cross-field';

const registry = new Map<string, Validator>();

export const defaultValidators: Validator[] = [
  notEmpty, stringLength, emailAddress, regularExpression, numberRange, integer, float,
  alphanumeric, number, dateTime, dateRange, fileSize, count, mimeType,
  equals, dateNotBefore, atLeastOne,
];

export function registerDefaultValidators(): void {
  defaultValidators.forEach(registerValidator);
}

export function getValidator(type: string): Validator | undefined {
  return registry.get(type);
}

export function registerValidator(validator: Validator): void {
  registry.set(validator.type, validator);
}

function contextFor(rule: ValidatorRule, ctx?: Partial<ValidatorContext>): ValidatorContext {
  return { ...detachedContext(rule), ...ctx, rule };
}

/**
 * Run rules synchronously and return the failures. Async validators are
 * skipped with a console error; use {@link runValidatorsAsync} for those.
 * Fields validate through the form pipeline instead (async-aware, translated
 * messages, server-only rules).
 */
export function runValidators(
  rules: ValidatorRule[],
  value: FieldValue,
  ctx?: Partial<ValidatorContext>,
): ValidatorResult[] {
  const results: ValidatorResult[] = [];

  for (const rule of rules) {
    if (rule.server) continue;
    const validator = registry.get(rule.type);
    if (!validator) {
      console.warn(`[FormLayer] Unknown validator type: "${rule.type}"`);
      continue;
    }

    const result = validator.validate(value, rule.options ?? {}, contextFor(rule, ctx));
    if (result instanceof Promise) {
      console.error(`[FormLayer] Async validator "${rule.type}" was skipped by runValidators(); use runValidatorsAsync().`);
      continue;
    }
    if (!result.valid) results.push(result);
  }

  return results;
}

export async function runValidatorsAsync(
  rules: ValidatorRule[],
  value: FieldValue,
  ctx?: Partial<ValidatorContext>,
): Promise<ValidatorResult[]> {
  const results: ValidatorResult[] = [];

  for (const rule of rules) {
    if (rule.server) continue;
    const validator = registry.get(rule.type);
    if (!validator) {
      console.warn(`[FormLayer] Unknown validator type: "${rule.type}"`);
      continue;
    }
    const result = await validator.validate(value, rule.options ?? {}, contextFor(rule, ctx));
    if (!result.valid) results.push(result);
  }

  return results;
}
