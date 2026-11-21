/**
 * Opt-in server-authoritative validation (issue #7): modes, batching,
 * aborting, stale results, form-level errors and the failure policy.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormController } from '../src/forms/form-controller';
import { registerDefaultValidators } from '../src/forms/validators';
import type { ServerValidationOptions, ServerValidationRequest, ServerValidationResult } from '../src/forms/server-validation';
import type { FormSubmitFunction } from '../src/forms/types';

registerDefaultValidators();

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const noopSubmit: FormSubmitFunction = async () => {};

/** A transport whose answers the test controls. */
function fakeServer(answer: (req: ServerValidationRequest) => ServerValidationResult | Promise<ServerValidationResult>) {
  const requests: ServerValidationRequest[] = [];
  const options: ServerValidationOptions = {
    debounceMs: 0,
    validate: vi.fn(async (req: ServerValidationRequest) => {
      requests.push(req);
      return answer(req);
    }),
  };
  return { options, requests };
}

function mountForm(html: string, attrs: Record<string, string> = {}): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'f';
  for (const [k, v] of Object.entries(attrs)) form.setAttribute(k, v);
  form.innerHTML = html;
  document.body.append(form);
  return form;
}

/** Type into a field and leave it. */
function fill(form: HTMLFormElement, selector: string, value: string): void {
  const input = form.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
}

const emailField = `
  <div data-form-field="email" data-validate='[{"type":"NotEmpty"},{"type":"EmailAddress"},{"type":"UniqueEmail","server":true}]'>
    <input id="email" name="email"><p id="email-errors" class="invalid-feedback"></p>
  </div>`;
const nameField = `
  <div data-form-field="name" data-validate='[{"type":"NotEmpty","options":{"message":"Client: required"}}]'>
    <input id="name" name="name">
  </div>`;
const taken = (req: ServerValidationRequest): ServerValidationResult => ({
  fields: Object.fromEntries(req.fields.map((f) => [f, req.formData.get(f) === 'taken@example.com' ? ['Already registered.'] : []])),
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('client+server mode', () => {
  it('checks fields with server-only rules once their client rules pass', async () => {
    const { options, requests } = fakeServer(taken);
    const form = mountForm(emailField, { 'data-server-validation': 'client+server' });
    const ctrl = new FormController(form, noopSubmit, { serverValidation: options });

    fill(form, '#email', 'taken@example.com');
    expect(ctrl.getField('email')?.isValidating).toBe(true);
    await tick(10);

    expect(requests).toHaveLength(1);
    expect(requests[0].fields).toEqual(['email']);
    expect(requests[0].formData.get('email')).toBe('taken@example.com');
    expect(ctrl.getField('email')).toMatchObject({ isValid: false, errors: ['Already registered.'], isValidating: false });
    expect(form.querySelector('#email-errors')!.textContent).toBe('Already registered.');
  });

  it('does not ask the server while client rules fail', async () => {
    const { requests, options } = fakeServer(taken);
    const form = mountForm(emailField, { 'data-server-validation': 'client+server' });
    new FormController(form, noopSubmit, { serverValidation: options });
    fill(form, '#email', 'not-an-email');
    await tick(10);
    expect(requests).toHaveLength(0);
  });

  it('does not ask the server about fields without server-only rules', async () => {
    const { requests, options } = fakeServer(taken);
    const form = mountForm(nameField, { 'data-server-validation': 'client+server' });
    new FormController(form, noopSubmit, { serverValidation: options });
    fill(form, '#name', 'Ada');
    await tick(10);
    expect(requests).toHaveLength(0);
  });

  it('keeps a server error until the value changes', async () => {
    const { options } = fakeServer(taken);
    const form = mountForm(emailField, { 'data-server-validation': 'client+server' });
    const ctrl = new FormController(form, noopSubmit, { serverValidation: options });
    fill(form, '#email', 'taken@example.com');
    await tick(10);
    expect(await ctrl.validate()).toBe(false);
    fill(form, '#email', 'free@example.com');
    await tick(10);
    expect(ctrl.getField('email')?.isValid).toBe(true);
  });
});

describe('server mode', () => {
  it('skips client rules and asks the server about every field', async () => {
    const { requests, options } = fakeServer((req) => ({
      fields: Object.fromEntries(req.fields.map((f) => [f, req.formData.get(f) ? [] : ['Server: required']])),
    }));
    const form = mountForm(nameField, { 'data-server-validation': 'server' });
    const ctrl = new FormController(form, noopSubmit, { serverValidation: options });

    fill(form, '#name', 'x');
    form.querySelector<HTMLInputElement>('#name')!.value = '';
    fill(form, '#name', '');
    await tick(10);

    expect(requests.at(-1)!.fields).toEqual(['name']);
    expect(ctrl.getField('name')?.errors).toEqual(['Server: required']);
  });

  it('submits without client validation', async () => {
    const { options } = fakeServer(() => ({ fields: {} }));
    const form = mountForm(nameField + '<button type="submit">Go</button>', { 'data-server-validation': 'server' });
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    new FormController(form, submitFn, { serverValidation: options });
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
    await tick(10);
    expect(submitFn).toHaveBeenCalledTimes(1);
  });
});

describe('client mode (default)', () => {
  it('never asks the server, even for server-only rules', async () => {
    const { requests, options } = fakeServer(taken);
    const form = mountForm(emailField);
    new FormController(form, noopSubmit, { serverValidation: options });
    fill(form, '#email', 'taken@example.com');
    await tick(10);
    expect(requests).toHaveLength(0);
  });

  it('is overridden by the mode option', async () => {
    const { requests, options } = fakeServer(taken);
    const form = mountForm(emailField);
    new FormController(form, noopSubmit, { serverValidation: { ...options, mode: 'client+server' } });
    fill(form, '#email', 'taken@example.com');
    await tick(10);
    expect(requests).toHaveLength(1);
  });
});

describe('scheduling', () => {
  const twoFields = emailField + `
    <div data-form-field="username" data-validate='[{"type":"UsernameFree","server":true}]'>
      <input id="username" name="username"></div>`;

  it('batches fields that change within the debounce window into one request', async () => {
    const { requests, options } = fakeServer(() => ({ fields: {} }));
    const form = mountForm(twoFields, { 'data-server-validation': 'client+server' });
    new FormController(form, noopSubmit, { serverValidation: { ...options, debounceMs: 20 } });
    fill(form, '#email', 'a@example.com');
    fill(form, '#username', 'ada');
    await tick(50);
    expect(requests).toHaveLength(1);
    expect(requests[0].fields.sort()).toEqual(['email', 'username']);
  });

  it('aborts the request in flight when a newer batch starts, and takes over its fields', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { requests, options } = fakeServer(async (req) => {
      if (requests.length === 1) await gate;
      return { fields: Object.fromEntries(req.fields.map((f) => [f, [`checked ${req.formData.get(f)}`]])) };
    });
    const form = mountForm(twoFields, { 'data-server-validation': 'client+server' });
    const ctrl = new FormController(form, noopSubmit, { serverValidation: options });

    fill(form, '#email', 'a@example.com');
    await tick(5); // first request is in flight
    fill(form, '#username', 'ada');
    await tick(10);

    expect(requests).toHaveLength(2);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].fields.sort()).toEqual(['email', 'username']);
    release();
    await tick(5);
    expect(ctrl.getField('email')?.errors).toEqual(['checked a@example.com']);
    expect(ctrl.getField('username')?.errors).toEqual(['checked ada']);
  });

  it('ignores an answer about a value that has changed since', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { options } = fakeServer(async () => {
      await gate;
      return { fields: { email: ['Already registered.'] } };
    });
    const form = mountForm(emailField, { 'data-server-validation': 'client+server' });
    const ctrl = new FormController(form, noopSubmit, { serverValidation: options });

    fill(form, '#email', 'taken@example.com');
    await tick(5);
    form.querySelector<HTMLInputElement>('#email')!.value = 'other@example.com';
    release();
    await tick(5);
    expect(ctrl.getField('email')?.errors).toEqual([]);
  });

  it('cancels pending checks when the form submits', async () => {
    const { requests, options } = fakeServer(taken);
    const form = mountForm(emailField + '<button type="submit">Go</button>', { 'data-server-validation': 'client+server' });
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    const ctrl = new FormController(form, submitFn, { serverValidation: { ...options, debounceMs: 30 } });
    fill(form, '#email', 'free@example.com');
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
    await tick(60);
    expect(requests).toHaveLength(0);
    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(ctrl.getField('email')?.isValidating).toBe(false);
  });
});

describe('form-level server errors', () => {
  it('render into [data-fl-form-errors] and make the form invalid', async () => {
    const { options } = fakeServer(() => ({ fields: {}, form: ['Too many attempts. Try again later.'] }));
    const form = mountForm('<div data-fl-form-errors></div>' + emailField, { 'data-server-validation': 'client+server' });
    const ctrl = new FormController(form, noopSubmit, { serverValidation: options });
    fill(form, '#email', 'free@example.com');
    await tick(10);
    expect(ctrl.getState().formErrors).toEqual(['Too many attempts. Try again later.']);
    expect(ctrl.getState().isValid).toBe(false);
    expect(form.querySelector('[data-fl-form-errors]')!.textContent).toBe('Too many attempts. Try again later.');
  });
});

describe('failure policy', () => {
  it('keeps the client result, dispatches an event and never blocks the submit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options: ServerValidationOptions = { debounceMs: 0, validate: async () => { throw new Error('offline'); } };
    const form = mountForm(emailField + '<button type="submit">Go</button>', { 'data-server-validation': 'client+server' });
    const onError = vi.fn();
    form.addEventListener('formlayer:server-validation-error', onError);
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    const ctrl = new FormController(form, submitFn, { serverValidation: options });

    fill(form, '#email', 'free@example.com');
    await tick(10);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as CustomEvent).detail.fields).toEqual(['email']);
    expect(ctrl.getField('email')).toMatchObject({ isValid: true, isValidating: false });

    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
    await tick(10);
    expect(submitFn).toHaveBeenCalledTimes(1);
  });
});
