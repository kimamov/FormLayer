import type {
  ServerValidationMode,
  ServerValidationOptions,
  ServerValidationResult,
} from '../forms/server-validation';
import { isTypo3AjaxSubmitEnabled } from './submit';

export interface Typo3ServerValidationOptions {
  /** Default mode; `data-server-validation` on the `<form>` overrides it. Default `client` (off). */
  mode?: ServerValidationMode;
  /** Batching window in ms. Default 300. */
  debounceMs?: number;
  /** Extra request headers, e.g. a CSRF token. */
  headers?: Record<string, string>;
}

const reported = new WeakSet<HTMLFormElement>();

/**
 * Server validation transport for TYPO3 EXT:form with the sitepackage's
 * `AjaxFormSubmitMiddleware`.
 *
 * Posts the whole form to its `action` with `X-Form-Ajax: 1` and
 * `X-Form-Validate: <field>,<field>`. The middleware validates the current
 * page without saving, advancing or running finishers, and answers
 * `{ "fields": { "<identifier>": ["…"] }, "form": ["…"] }`.
 *
 * Only forms with AJAX enabled (`data-ajax="1"`) use it; others stay in
 * `client` mode.
 */
export function createTypo3ServerValidation(options: Typo3ServerValidationOptions = {}): ServerValidationOptions {
  return {
    mode: options.mode,
    debounceMs: options.debounceMs,
    isAvailable(form) {
      const available = isTypo3AjaxSubmitEnabled(form);
      if (!available && form.hasAttribute('data-server-validation') && !reported.has(form)) {
        reported.add(form);
        console.debug(`[FormLayer] Server validation needs AJAX submission (data-ajax="1"); form "${form.id}" validates on the client only.`);
      }
      return available;
    },
    async validate({ fields, formData, signal, form }) {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { ...options.headers, 'X-Form-Ajax': '1', 'X-Form-Validate': fields.join(',') },
        body: formData,
        signal,
      });
      if (!response.ok) {
        throw new Error(`Server validation failed: the server responded with ${response.status}`);
      }
      return normalizeTypo3ValidationResponse(await response.json(), fields);
    },
  };
}

function messages(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' && value !== '' ? [value] : [];
}

/**
 * Map a validate-only response onto the requested fields.
 *
 * Accepts `{ fields, form }` and, for robustness, the submit-shaped
 * `{ errors }`. Keys may be FormLayer field names (the element identifiers)
 * or full TYPO3 names such as `tx_form_formframework[form-1][email]`. Errors
 * for fields that were not requested are dropped; `__form` and `""` keys are
 * form-level errors.
 */
export function normalizeTypo3ValidationResponse(data: unknown, requested: string[]): ServerValidationResult {
  const body = (data ?? {}) as { fields?: Record<string, unknown>; errors?: Record<string, unknown>; form?: unknown };
  const raw = body.fields ?? body.errors ?? {};
  const fields: Record<string, string[]> = {};
  const form = messages(body.form);

  for (const [key, value] of Object.entries(raw)) {
    if (key === '__form' || key === '') {
      form.push(...messages(value));
      continue;
    }
    const name = requested.includes(key)
      ? key
      : requested.find((f) => key.endsWith(`[${f}]`)) ?? key.match(/\[([^\]]+)\]$/)?.[1] ?? key;
    if (!requested.includes(name)) continue;
    (fields[name] ??= []).push(...messages(value));
  }

  return { fields, form };
}
