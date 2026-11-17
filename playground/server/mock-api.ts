import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Plugin } from 'vite';
import { forms, type FormValues } from './forms';

/**
 * Mock backend in the shape of the TYPO3 sitepackage middleware
 * (see docs/src/content/docs/guides/typo3-backend.md).
 *
 * - `X-Form-Ajax: 1`           → TYPO3 JSON response (valid/errors/finished/html/…)
 * - `X-Form-Validate: a,b`     → validate-only `{ fields, form }` (roadmap milestone 3/4)
 * - neither (no-JS fallback)   → plain HTML page
 *
 * Form-level errors use the key `__form`.
 * `<!-- ssr:<formId> -->` in a scenario page is replaced by the server-rendered form.
 */
export function mockApi(): Plugin {
  return {
    name: 'formlayer-playground-mock-api',
    configureServer(server) {
      server.middlewares.use('/api/forms', (req, res, next) => {
        handle(req, res).catch(next);
      });
    },
    transformIndexHtml(html) {
      return html.replace(/<!--\s*ssr:([\w-]+)\s*-->/g, (_, id: string) => forms[id]?.render?.() ?? `<!-- unknown form ${id} -->`);
    },
  };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const id = (req.url ?? '').replace(/^\//, '').split('?')[0];
  const form = forms[id];
  if (req.method !== 'POST' || !form) {
    send(res, 404, 'text/plain', 'Not found');
    return;
  }

  const values = await readValues(req);
  // Simulate network latency so loading states are visible.
  await new Promise((r) => setTimeout(r, 250));

  const validateOnly = header(req, 'x-form-validate');
  if (validateOnly) {
    const requested = validateOnly.split(',').map((s) => s.trim()).filter(Boolean);
    const errors = form.validate(values);
    const fields = Object.fromEntries(requested.map((name) => [name, errors[name] ?? []]));
    sendJson(res, { fields, form: errors.__form ?? [] });
    return;
  }

  const result = form.submit(values);

  if (header(req, 'x-form-ajax') === '1') {
    sendJson(res, {
      valid: result.valid,
      errors: result.errors,
      page: result.page ?? { current: 1, total: 1 },
      finished: result.finished,
      redirect: null,
      message: result.message ?? null,
      html: result.html ?? null,
      state: '',
    });
    return;
  }

  // No-JS fallback: a deliberately plain page.
  const body = result.valid
    ? (result.html ?? result.message ?? '<p>Thank you.</p>')
    : `<h1>Please fix the following</h1><ul>${Object.entries(result.errors)
        .flatMap(([name, msgs]) => msgs.map((m) => `<li><strong>${escape(name)}</strong>: ${escape(m)}</li>`))
        .join('')}</ul><p><a href="javascript:history.back()">Back to the form</a></p>`;
  send(res, result.valid ? 200 : 422, 'text/html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Result</title><main>${body}</main></html>`);
}

async function readValues(req: IncomingMessage): Promise<FormValues> {
  const request = new Request('http://playground.local/', {
    method: 'POST',
    headers: req.headers as Record<string, string>,
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  const data = await request.formData();
  const values: FormValues = {};
  for (const key of new Set(data.keys())) {
    const all = data.getAll(key).map((v) => (typeof v === 'string' ? v : v.name));
    values[key] = all.length > 1 ? all : all[0];
  }
  return values;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res: ServerResponse, data: unknown): void {
  send(res, 200, 'application/json', JSON.stringify(data));
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.end(body);
}

export function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
