import type { FormField } from './types';
import { valueKey } from './field-value';

/**
 * - `client` (default): only client rules; server-only rules are checked by the submit.
 * - `client+server`: client rules first; fields with server-only rules are then checked on the server.
 * - `server`: no client rules; every field is checked on the server.
 */
export type ServerValidationMode = 'client' | 'client+server' | 'server';

export interface ServerValidationRequest {
  /** Names (`data-form-field`) of the fields to check. */
  fields: string[];
  /** The whole form's data, so the server sees the same input as on submit. */
  formData: FormData;
  /** Aborted when a newer request replaces this one, or the form submits or is destroyed. */
  signal: AbortSignal;
  form: HTMLFormElement;
}

export interface ServerValidationResult {
  /** Errors for the requested fields; `[]` (or a missing key) means valid. */
  fields: Record<string, string[]>;
  /** Form-level errors. */
  form?: string[];
}

export interface ServerValidationOptions {
  /** Default mode for the form; `data-server-validation` on the `<form>` overrides it. */
  mode?: ServerValidationMode;
  /** The transport: send the request to the server and return its answer. */
  validate(request: ServerValidationRequest): Promise<ServerValidationResult>;
  /** Wait after a field asks for a check, to batch fields that change together. Default 300 ms. */
  debounceMs?: number;
  /** Whether this transport can serve a form at all (for example only AJAX-enabled forms). Default: yes. */
  isAvailable?(form: HTMLFormElement): boolean;
}

export interface ServerValidationErrorDetail {
  error: unknown;
  fields: string[];
}

const MODES: ServerValidationMode[] = ['client', 'client+server', 'server'];

export function resolveServerValidationMode(
  formEl: HTMLFormElement,
  options: ServerValidationOptions | undefined,
): ServerValidationMode {
  if (!options?.validate) return 'client';
  if (options.isAvailable && !options.isAvailable(formEl)) return 'client';
  const attr = formEl.getAttribute('data-server-validation') as ServerValidationMode | null;
  if (attr && MODES.includes(attr)) return attr;
  return options.mode ?? 'client';
}

interface SchedulerHost {
  formEl: HTMLFormElement;
  field(name: string): FormField | undefined;
  applyFormErrors(errors: string[]): void;
}

/**
 * Per-form scheduler for server checks: batches fields that ask within the
 * debounce window into one request, keeps at most one request in flight (a
 * newer batch aborts the older one and takes over its fields), ignores
 * results for fields whose value changed meanwhile, and never lets a failed
 * request block the user.
 */
export class ServerValidationScheduler {
  private queued = new Set<string>();
  private inflight: { fields: Set<string>; abort: AbortController; keys: Map<string, string> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly options: ServerValidationOptions,
    private readonly host: SchedulerHost,
  ) {}

  /** Ask for a server check of a field. */
  request(name: string): void {
    this.queued.add(name);
    this.host.field(name)?.setValidating?.(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.debounceMs ?? 300);
  }

  /** Abort everything pending (the form is submitting or being destroyed). */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const names = new Set([...this.queued, ...(this.inflight?.fields ?? [])]);
    this.inflight?.abort.abort();
    this.inflight = null;
    this.queued.clear();
    for (const name of names) this.host.field(name)?.setValidating?.(false);
  }

  private async flush(): Promise<void> {
    // A newer batch replaces the one in flight and takes over its fields.
    const fields = new Set([...this.queued, ...(this.inflight?.fields ?? [])]);
    this.queued.clear();
    this.inflight?.abort.abort();
    if (fields.size === 0) return;

    const keys = new Map<string, string>();
    for (const name of fields) {
      const field = this.host.field(name);
      if (field) keys.set(name, valueKey(field.getState().value));
    }

    const batch = { fields, abort: new AbortController(), keys };
    this.inflight = batch;

    let result: ServerValidationResult;
    try {
      result = await this.options.validate({
        fields: [...fields],
        formData: new FormData(this.host.formEl),
        signal: batch.abort.signal,
        form: this.host.formEl,
      });
    } catch (error) {
      if (batch.abort.signal.aborted) return;
      this.inflight = null;
      this.finish(fields);
      console.warn('[FormLayer] Server validation failed; keeping the client result:', error);
      this.host.formEl.dispatchEvent(new CustomEvent<ServerValidationErrorDetail>('formlayer:server-validation-error', {
        bubbles: true,
        detail: { error, fields: [...fields] },
      }));
      return;
    }

    if (batch.abort.signal.aborted) return;
    this.inflight = null;

    for (const name of fields) {
      if (this.queued.has(name)) continue; // a newer check for this field is already queued
      const field = this.host.field(name);
      if (!field) continue;
      field.setValidating?.(false);
      // The value changed while the request ran: this answer is about an old value.
      if (valueKey(field.getState().value) !== keys.get(name)) continue;
      field.setServerErrors(result?.fields?.[name] ?? []);
    }
    this.host.applyFormErrors(Array.isArray(result?.form) ? result.form : []);
  }

  private finish(fields: Iterable<string>): void {
    for (const name of fields) {
      if (!this.queued.has(name)) this.host.field(name)?.setValidating?.(false);
    }
  }
}
