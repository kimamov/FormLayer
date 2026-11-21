/**
 * DOM events, submission results, focus after swaps, registry without ids,
 * plugins with options and hooks, TYPO3 mapping (issue #11).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormController } from '../src/forms/form-controller';
import { FormRegistry } from '../src/forms/registry';
import { defineField } from '../src/forms/define-field';
import { registerDefaultValidators } from '../src/forms/validators';
import { createTypo3Submit, typo3ErrorsToResult } from '../src/typo3/submit';
import type { FormPlugin, FormPluginHost, FormSubmitFunction } from '../src/forms/types';

registerDefaultValidators();

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const noopSubmit: FormSubmitFunction = async () => {};

function mountForm(html: string, id: string | null = 'f'): HTMLFormElement {
  const form = document.createElement('form');
  if (id) form.id = id;
  form.action = '/submit';
  form.innerHTML = html;
  document.body.append(form);
  return form;
}

function submit(form: HTMLFormElement, submitter?: HTMLElement): void {
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, submitter: submitter ?? null }));
}

const requiredName = `<div data-form-field="name" data-validate='[{"type":"NotEmpty"}]'><input id="name" name="name"></div>`;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DOM events', () => {
  it('dispatch field events on the wrapper and form events on the form, bubbling', async () => {
    const form = mountForm(requiredName);
    const ctrl = new FormController(form, noopSubmit);
    const seen: string[] = [];
    document.addEventListener('formlayer:field-change', (e) => seen.push(`${e.type}@${(e.target as HTMLElement).dataset.formField}`));
    form.addEventListener('formlayer:invalid', (e) => seen.push(`${e.type}:${e.detail.formId}`));

    const input = form.querySelector<HTMLInputElement>('#name')!;
    input.value = 'x';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await ctrl.validate();
    input.value = '';
    await ctrl.validate();

    expect(seen).toContain('formlayer:field-change@name');
    expect(seen).toContain('formlayer:invalid:f');
  });

  it('before-submit can cancel the submit', async () => {
    const form = mountForm('<div data-form-field="a"><input name="a" value="x"></div>');
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    new FormController(form, submitFn);
    form.addEventListener('formlayer:before-submit', (e) => e.preventDefault());
    submit(form);
    await tick(10);
    expect(submitFn).not.toHaveBeenCalled();
  });

  it('on() and once() return an unsubscribe function', async () => {
    const form = mountForm(requiredName);
    const ctrl = new FormController(form, noopSubmit);
    const handler = vi.fn();
    const off = ctrl.on('form:invalid', handler);
    await ctrl.validate();
    off();
    await ctrl.validate();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('custom fields can emit their own events with ctx.emit()', () => {
    const Rating = defineField({
      setup(ctx) {
        const input = ctx.control<HTMLInputElement>();
        ctx.emit('rating:ready', { stars: 5 });
        return { read: () => input.value, write: () => {} };
      },
    });
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-form-field', 'r');
    wrapper.innerHTML = '<input name="r">';
    document.body.append(wrapper);
    const handler = vi.fn();
    document.addEventListener('rating:ready', handler);
    new Rating(wrapper);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ stars: 5 });
  });
});

describe('applyResult()', () => {
  const formHtml = `<div data-fl-form-errors tabindex="-1"></div>
    <div data-form-field="email"><input id="email" name="email" value="a@example.com"><p class="invalid-feedback"></p></div>
    <button type="submit">Send</button>`;

  it('shows field and form-level errors and dispatches submit-result', async () => {
    const form = mountForm(formHtml);
    const results = vi.fn();
    form.addEventListener('formlayer:submit-result', results);
    const ctrl = new FormController(form, async (ctx) => {
      ctx.applyResult({ fields: { email: ['Taken.'] }, form: ['Rate limited.'] });
    });
    submit(form, form.querySelector('button')!);
    await tick(10);
    expect(ctrl.getField('email')?.errors).toEqual(['Taken.']);
    expect(ctrl.getState().formErrors).toEqual(['Rate limited.']);
    expect(form.querySelector('[data-fl-form-errors]')!.textContent).toBe('Rate limited.');
    expect(results).toHaveBeenCalledTimes(1);
  });

  it('focuses the form error container when only form-level errors come back', async () => {
    const form = mountForm(formHtml);
    new FormController(form, async (ctx) => { ctx.applyResult({ form: ['Spam detected.'] }); });
    form.querySelector<HTMLButtonElement>('button')!.focus();
    submit(form, form.querySelector('button')!);
    await tick(10);
    expect(document.activeElement).toBe(form.querySelector('[data-fl-form-errors]'));
  });

  it('replaces the form with the confirmation when finished and focuses it', async () => {
    const form = mountForm(formHtml);
    const ctrl = new FormController(form, async (ctx) => {
      ctx.applyResult({ finished: true, message: '<div class="ok" role="status" data-form-success><h2>Thanks!</h2></div>' });
    });
    form.querySelector<HTMLButtonElement>('button')!.focus();
    submit(form, form.querySelector('button')!);
    await tick(10);
    const confirmation = document.querySelector<HTMLElement>('[data-form-success]')!;
    expect(form.isConnected).toBe(false);
    expect(document.activeElement).toBe(confirmation);
    expect(confirmation.getAttribute('tabindex')).toBe('-1');
    expect(ctrl.getState().fields).toEqual({});
  });

  it('swaps in the next step, enhances it with the same options and focuses its heading', async () => {
    const step2 = `<form id="f" action="/submit"><h2 id="step-2">Step 2</h2>
      <div data-form-field="city" data-validate='[{"type":"NotEmpty"}]'><input id="city" name="city"></div>
      <button type="submit">Next</button></form>`;
    const registry = new FormRegistry();
    const submitFn = vi.fn<FormSubmitFunction>(async (ctx) => { ctx.applyResult({ html: step2 }); });
    const form = mountForm(formHtml);
    registry.register(form, submitFn);
    form.querySelector<HTMLButtonElement>('button')!.focus();

    submit(form, form.querySelector('button')!);
    await tick(10);

    const newForm = document.getElementById('f') as HTMLFormElement;
    expect(newForm).not.toBe(form);
    expect(document.activeElement?.id).toBe('step-2');
    expect(registry.get(newForm)?.getField('city')).toBeDefined();
    expect(registry.get('f')).toBe(registry.get(newForm));
  });

  it('standalone controllers enhance the swapped-in form too', async () => {
    const step2 = '<form id="s2"><div data-form-field="x"><input name="x"></div></form>';
    const form = mountForm(formHtml);
    new FormController(form, async (ctx) => { ctx.replace(step2); });
    submit(form, form.querySelector('button')!);
    await tick(10);
    expect(document.getElementById('s2')!.hasAttribute('novalidate')).toBe(true);
  });
});

describe('registry', () => {
  it('enhances forms without an id and finds them by element', () => {
    const registry = new FormRegistry();
    const form = mountForm('<div data-form-field="a"><input name="a"></div>', null);
    registry.init({ submitFn: noopSubmit });
    const ctrl = registry.get(form)!;
    expect(ctrl.id).toMatch(/^formlayer-/);
    expect(registry.get(ctrl.id)).toBe(ctrl);
    registry.unregister(form);
    expect(registry.get(form)).toBeUndefined();
  });
});

describe('plugins', () => {
  it('accept a class with options, attach it synchronously and run submit hooks', async () => {
    const calls: string[] = [];
    class StampPlugin implements FormPlugin {
      constructor(private readonly options?: { stamp: string }) {}
      init(_formEl: HTMLFormElement, host: FormPluginHost) { calls.push(`init:${host.id}:${this.options?.stamp}`); }
      beforeValidate() { calls.push('beforeValidate'); }
      transformFormData(formData: FormData) { formData.append('stamp', this.options!.stamp); }
      afterSubmit({ result }: { result: unknown }) { calls.push(`afterSubmit:${JSON.stringify(result)}`); }
      destroy() { calls.push('destroy'); }
    }
    const registry = new FormRegistry();
    registry.registerFormPlugin(StampPlugin, { stamp: 'v2' });
    const sent: Array<string | null> = [];
    const form = mountForm('<div data-form-field="a"><input name="a" value="x"></div><button type="submit">Go</button>');
    const ctrl = registry.register(form, async (ctx) => {
      sent.push(ctx.formData.get('stamp') as string | null);
      ctx.applyResult({});
    });
    expect(calls).toEqual(['init:f:v2']); // synchronous

    submit(form, form.querySelector('button')!);
    await tick(10);
    expect(sent).toEqual(['v2']);
    expect(calls).toEqual(['init:f:v2', 'beforeValidate', 'afterSubmit:{}']);
    ctrl.destroy();
    expect(calls.at(-1)).toBe('destroy');
  });
});

describe('TYPO3 mapping', () => {
  it('splits __form and "" into form-level errors and maps full names', () => {
    expect(typo3ErrorsToResult({
      email: ['Taken.'],
      'tx_form_formframework[contact][name]': ['Required.'],
      __form: ['Spam.'],
      '': ['Also form.'],
    })).toEqual({ fields: { email: ['Taken.'], name: ['Required.'] }, form: ['Spam.', 'Also form.'] });
  });

  it('shows a TYPO3 error that is not tied to a field in the form error container', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      valid: false, errors: { __form: ['Your message was flagged as spam.'] },
      page: { current: 1, total: 1 }, finished: false, redirect: null, message: null, state: '',
    }), { status: 200 })));
    const form = mountForm(`<div data-fl-form-errors tabindex="-1"></div>
      <div data-form-field="msg"><input name="msg" value="spam"></div><button type="submit">Send</button>`);
    form.dataset.ajax = '1';
    const ctrl = new FormController(form, createTypo3Submit());
    submit(form, form.querySelector('button')!);
    await tick(20);
    expect(ctrl.getState().formErrors).toEqual(['Your message was flagged as spam.']);
    expect(form.querySelector('[data-fl-form-errors]')!.textContent).toBe('Your message was flagged as spam.');
  });
});
