import type { Validator, ValidatorRule, ValidatorResult } from '../types';
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

const registry = new Map<string, Validator>();



export function registerDefaultValidators(){
  registerValidator(notEmpty);
  registerValidator(stringLength);
  registerValidator(emailAddress);
  registerValidator(regularExpression);
  registerValidator(numberRange);
  registerValidator(integer);
  registerValidator(float);
  registerValidator(alphanumeric);
  registerValidator(number);
  registerValidator(dateTime);
  registerValidator(dateRange);
  registerValidator(fileSize);
  registerValidator(count);
  registerValidator(mimeType);
}



export function getValidator(type: string): Validator | undefined {
  return registry.get(type);
}

export function registerValidator(validator: Validator): void {
  registry.set(validator.type, validator);
}

export function runValidators(
  rules: ValidatorRule[],
  value: string,
  extraOptions?: Record<string, unknown>,
): ValidatorResult[] {
  const results: ValidatorResult[] = [];

  for (const rule of rules) {
    const validator = registry.get(rule.type);
    if (!validator) {
      console.warn(`[FormLayer] Unknown validator type: "${rule.type}"`);
      continue;
    }

    const options = { ...(rule.options ?? {}), ...(extraOptions ?? {}) };
    const result = validator.validate(value, options);
    if (result instanceof Promise) {
      // Field validation is synchronous in 0.x: async validators cannot block a submit yet.
      console.error(`[FormLayer] Async validator "${rule.type}" was skipped: field validation is synchronous in FormLayer 0.x, so this rule does not run. Validate it on the server instead.`);
      continue;
    }
    if (!result.valid) {
      results.push(result);
    }
  }

  return results;
}

export async function runValidatorsAsync(
  rules: ValidatorRule[],
  value: string,
  extraOptions?: Record<string, unknown>,
): Promise<ValidatorResult[]> {
  const results: ValidatorResult[] = [];

  for (const rule of rules) {
    const validator = registry.get(rule.type);
    if (!validator) {
      console.warn(`[FormLayer] Unknown validator type: "${rule.type}"`);
      continue;
    }

    const options = { ...(rule.options ?? {}), ...(extraOptions ?? {}) };
    const result = await validator.validate(value, options);
    if (!result.valid) {
      results.push(result);
    }
  }

  return results;
}
