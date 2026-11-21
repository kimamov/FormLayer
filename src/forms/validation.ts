import type { Validator, ValidatorResult, ValidatorRule, FieldValue } from './types';

// ---------------------------------------------------------------------------
// validator context
// ---------------------------------------------------------------------------

/** What a validator can see besides the value and its options. */
export interface ValidatorContext {
  /** The field being validated (`name: '__form'` for form-level rules). */
  field: { name: string; element: HTMLElement };
  /** Other fields' values. `getValue()` returns `undefined` for unknown fields and outside a form. */
  form: { getValue(name: string): FieldValue | undefined };
  /** Selected files (file inputs), otherwise empty. */
  files: File[];
  /** Aborted when a newer validation of the same field starts. Pass it to `fetch()`. */
  signal: AbortSignal;
  /** The rule being run, as written in `data-validate`. */
  rule: ValidatorRule;
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

/**
 * Translations for validator message keys, e.g. `{ NotEmpty: 'Bitte ausfüllen.' }`.
 * `{name}` placeholders are replaced with the result's params. A function can
 * resolve keys itself; returning `undefined` falls back to the next source.
 */
export type ValidationMessages =
  | Record<string, string>
  | ((key: string, params: Record<string, unknown>) => string | undefined);

let globalMessages: ValidationMessages | undefined;

/** Set translations for validator messages for every form (per-form `messages` take precedence). */
export function setValidationMessages(messages: ValidationMessages | undefined): void {
  globalMessages = messages;
}

function lookup(messages: ValidationMessages | undefined, key: string, params: Record<string, unknown>): string | undefined {
  if (!messages) return undefined;
  const template = typeof messages === 'function' ? messages(key, params) : messages[key];
  if (typeof template !== 'string') return undefined;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * The message shown for a failed rule, in this order:
 * 1. `options.message` from the rule (sent by the server),
 * 2. the result's `key` in the form's or field's `messages`,
 * 3. the key in the global messages (`setValidationMessages()`),
 * 4. the validator's own message (English for built-ins).
 */
export function resolveMessage(rule: ValidatorRule, result: ValidatorResult, messages?: ValidationMessages): string {
  const fromRule = rule.options?.['message'];
  if (typeof fromRule === 'string' && fromRule !== '') return fromRule;
  if (result.key) {
    const params = result.params ?? {};
    const translated = lookup(messages, result.key, params) ?? lookup(globalMessages, result.key, params);
    if (translated) return translated;
  }
  return result.message || 'This value is invalid.';
}

// ---------------------------------------------------------------------------
// defineValidator
// ---------------------------------------------------------------------------

type OptionType = NumberConstructor | StringConstructor | BooleanConstructor | ArrayConstructor;
export type ValidatorOptionSchema = Record<string, OptionType>;

type OptionValue<T> = T extends NumberConstructor ? number
  : T extends BooleanConstructor ? boolean
  : T extends ArrayConstructor ? string[]
  : string;

/** Options as the validator receives them: declared ones converted, all optional, plus `message`. */
export type ValidatorOptions<S extends ValidatorOptionSchema> =
  { [K in keyof S]?: OptionValue<S[K]> } & { message?: string; [key: string]: unknown };

export interface ValidatorDefinition<S extends ValidatorOptionSchema> {
  /** The rule type used in `data-validate`, e.g. `"StringLength"`. */
  type: string;
  /** Declared options are converted from attribute strings: `Number`, `String`, `Boolean`, `Array`. */
  options?: S;
  validate(
    value: FieldValue,
    options: ValidatorOptions<S>,
    ctx: ValidatorContext,
  ): ValidatorResult | Promise<ValidatorResult>;
}

function convert(type: OptionType, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (type === Number) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  if (type === Boolean) return raw === true || raw === 'true' || raw === '1' || raw === 1;
  if (type === Array) {
    if (Array.isArray(raw)) return raw.map(String);
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return String(raw);
}

/**
 * Define a validator with typed options.
 *
 * ```ts
 * export const minWords = defineValidator({
 *   type: 'MinWords',
 *   options: { minimum: Number },
 *   validate(value, { minimum = 1 }) {
 *     const words = valueToString(value).trim().split(/\s+/).filter(Boolean).length;
 *     return words >= minimum ? VALID : invalid('MinWords', `Use at least ${minimum} words.`, { minimum });
 *   },
 * });
 * ```
 */
export function defineValidator<S extends ValidatorOptionSchema = Record<never, OptionType>>(
  definition: ValidatorDefinition<S>,
): Validator {
  const schema = definition.options ?? ({} as S);
  return {
    type: definition.type,
    validate(value, options, ctx) {
      const converted: Record<string, unknown> = { ...(options ?? {}) };
      for (const [key, type] of Object.entries(schema)) {
        converted[key] = convert(type, converted[key]);
      }
      const custom = typeof converted['message'] === 'string' && converted['message'] !== '' ? converted['message'] as string : null;
      const withMessage = (r: ValidatorResult): ValidatorResult => (custom && !r.valid ? { ...r, message: custom } : r);
      const result = definition.validate(value, converted as ValidatorOptions<S>, ctx ?? detachedContext());
      return result instanceof Promise ? result.then(withMessage) : withMessage(result);
    },
  };
}

/** A passing result. */
export const VALID: ValidatorResult = Object.freeze({ valid: true, message: '' }) as ValidatorResult;

/** A failing result with a translatable key, an English default and message parameters. */
export function invalid(key: string, message: string, params?: Record<string, unknown>): ValidatorResult {
  return { valid: false, key, message, params };
}

// ---------------------------------------------------------------------------
// running rules
// ---------------------------------------------------------------------------

export interface RuleRunOptions {
  /** Per-form/field validators, looked up before the global registry. */
  validators?: Validator[];
  messages?: ValidationMessages;
  /** Global lookup (injected to avoid an import cycle with the registry). */
  getValidator: (type: string) => Validator | undefined;
}

export interface RuleRunResult {
  /** Errors from synchronous rules, available immediately. */
  errors: string[];
  /** All errors in rule order, once async rules have settled. `null` when every rule was synchronous. */
  pending: Promise<string[]> | null;
}

const reportedUnknown = new Set<string>();

/** True for rules that only run on the server: `"server": true`, or a type no client validator handles. */
export function isServerOnlyRule(rule: ValidatorRule, find: (type: string) => Validator | undefined): boolean {
  return rule.server === true || !find(rule.type);
}

/**
 * Run rules against a value. Synchronous rules report at once; async rules are
 * awaited together. Server-only rules are skipped without a warning. A
 * validator that throws is logged and treated as passing.
 */
export function runRules(
  rules: ValidatorRule[],
  value: FieldValue,
  ctx: Omit<ValidatorContext, 'rule'>,
  options: RuleRunOptions,
): RuleRunResult {
  const find = (type: string) => options.validators?.find((v) => v.type === type) ?? options.getValidator(type);
  const slots: Array<string | null | Promise<string | null>> = [];

  for (const rule of rules) {
    if (rule.server === true) continue;
    const validator = find(rule.type);
    if (!validator) {
      if (!reportedUnknown.has(rule.type)) {
        reportedUnknown.add(rule.type);
        console.debug(`[FormLayer] No client validator for "${rule.type}"; it is left to the server.`);
      }
      continue;
    }

    const ruleCtx: ValidatorContext = { ...ctx, rule };
    let result: ValidatorResult | Promise<ValidatorResult>;
    try {
      result = validator.validate(value, rule.options ?? {}, ruleCtx);
    } catch (err) {
      console.error(`[FormLayer] Validator "${rule.type}" threw:`, err);
      continue;
    }

    if (result && typeof (result as Promise<ValidatorResult>).then === 'function') {
      slots.push(
        (result as Promise<ValidatorResult>).then(
          (r) => (r.valid ? null : resolveMessage(rule, r, options.messages)),
          (err) => {
            if ((err as Error)?.name !== 'AbortError') {
              console.error(`[FormLayer] Async validator "${rule.type}" failed:`, err);
            }
            return null;
          },
        ),
      );
    } else {
      const r = result as ValidatorResult;
      slots.push(r.valid ? null : resolveMessage(rule, r, options.messages));
    }
  }

  const errors = slots.filter((s): s is string => typeof s === 'string');
  const hasAsync = slots.some((s) => s instanceof Promise);
  return {
    errors,
    pending: hasAsync
      ? Promise.all(slots).then((all) => all.filter((s): s is string => typeof s === 'string'))
      : null,
  };
}

/** Field names a rule list refers to through `options.field` / `options.fields`. */
export function ruleDependencies(rules: ValidatorRule[]): string[] {
  const names = new Set<string>();
  for (const rule of rules) {
    const field = rule.options?.['field'];
    if (typeof field === 'string' && field) names.add(field);
    const fields = rule.options?.['fields'];
    if (Array.isArray(fields)) fields.forEach((f) => typeof f === 'string' && names.add(f));
  }
  return [...names];
}

/** A context for validators called directly (tests, `runValidators()` without a context). */
export function detachedContext(rule: ValidatorRule = { type: '' }): ValidatorContext {
  return {
    field: { name: '', element: typeof document !== 'undefined' ? document.body : (undefined as unknown as HTMLElement) },
    form: { getValue: () => undefined },
    files: [],
    signal: new AbortController().signal,
    rule,
  };
}
