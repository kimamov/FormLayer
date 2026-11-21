/**
 * TYPO3 server-validation transport (issue #10).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTypo3ServerValidation, normalizeTypo3ValidationResponse, initTypo3Forms } from '../src/typo3/index';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mountForm(attrs: Record<string, string>): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'contact';
  form.action = '/contact';
  for (const [k, v] of Object.entries(attrs)) form.setAttribute(k, v);
  form.innerHTML = `
    <div data-form-field="email" data-validate='[{"type":"NotEmpty"},{"type":"UniqueEmail","server":true}]'>
      <input id="email" name="tx_form_formframework[contact][email]">
    </div>`;
  document.body.append(form);
  return form;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeTypo3ValidationResponse', () => {
  it('maps identifiers and full TYPO3 names to the requested fields', () => {
    const result = normalizeTypo3ValidationResponse({
      fields: {
        email: ['Taken.'],
        'tx_form_formframework[contact][name]': ['Required.'],
      },
    }, ['email', 'name']);
    expect(result.fields).toEqual({ email: ['Taken.'], name: ['Required.'] });
  });

  it('drops fields that were not requested and collects form-level errors', () => {
    const result = normalizeTypo3ValidationResponse({
      fields: { email: [], other: ['Not asked.'], __form: ['Rate limited.'] },
      form: ['Try later.'],
    }, ['email']);
    expect(result.fields).toEqual({ email: [] });
    expect(result.form).toEqual(['Try later.', 'Rate limited.']);
  });

  it('accepts the submit-shaped { errors } answer', () => {
    expect(normalizeTypo3ValidationResponse({ valid: false, errors: { email: ['Taken.'] } }, ['email']).fields)
      .toEqual({ email: ['Taken.'] });
  });
});

describe('createTypo3ServerValidation', () => {
  it('posts the form with the validate-only headers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ fields: { email: ['Taken.'] } }));
    vi.stubGlobal('fetch', fetchMock);
    const form = mountForm({ 'data-ajax': '1' });
    const transport = createTypo3ServerValidation({ headers: { 'X-CSRF-Token': 'abc' } });
    const formData = new FormData(form);
    const signal = new AbortController().signal;

    const result = await transport.validate({ fields: ['email'], formData, signal, form });

    expect(result.fields).toEqual({ email: ['Taken.'] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(form.action);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(formData);
    expect(init.signal).toBe(signal);
    expect(init.headers).toEqual({ 'X-CSRF-Token': 'abc', 'X-Form-Ajax': '1', 'X-Form-Validate': 'email' });
  });

  it('throws on an error status so the core keeps the client result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const form = mountForm({ 'data-ajax': '1' });
    await expect(createTypo3ServerValidation().validate({
      fields: ['email'], formData: new FormData(form), signal: new AbortController().signal, form,
    })).rejects.toThrow('500');
  });

  it('is only available for AJAX-enabled forms', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const transport = createTypo3ServerValidation();
    expect(transport.isAvailable!(mountForm({ 'data-ajax': '1' }))).toBe(true);
    expect(transport.isAvailable!(mountForm({}))).toBe(false);
  });
});

describe('initTypo3Forms', () => {
  function typeAndLeave(form: HTMLFormElement, value: string): void {
    const input = form.querySelector<HTMLInputElement>('#email')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
  }

  it('uses the TYPO3 transport for forms that opt in', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ fields: { email: ['This email is already registered.'] } }));
    vi.stubGlobal('fetch', fetchMock);
    const form = mountForm({ 'data-ajax': '1', 'data-server-validation': 'client+server' });
    const api = initTypo3Forms({ serverValidation: { debounceMs: 0 } });
    try {
      typeAndLeave(form, 'taken@example.com');
      await tick(10);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(api.registry.get('contact')?.getField('email')?.errors).toEqual(['This email is already registered.']);
    } finally {
      api.destroy();
    }
  });

  it('stays in client mode without data-ajax, and when turned off', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => jsonResponse({ fields: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const noAjax = mountForm({ 'data-server-validation': 'client+server' });
    let api = initTypo3Forms({ serverValidation: { debounceMs: 0 } });
    typeAndLeave(noAjax, 'a@example.com');
    await tick(10);
    api.destroy();
    noAjax.remove();

    const off = mountForm({ 'data-ajax': '1', 'data-server-validation': 'client+server' });
    api = initTypo3Forms({ serverValidation: false });
    typeAndLeave(off, 'a@example.com');
    await tick(10);
    api.destroy();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
