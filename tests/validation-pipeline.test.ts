/**
 * The v2 validation pipeline (issue #9): async rules, validator context,
 * defineValidator, messages, triggers, cross-field and form-level rules.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormController } from '../src/forms/form-controller';
import { NativeField } from '../src/forms/native-field';
import { defineValidator, invalid, setValidationMessages, VALID } from '../src/forms/validation';
import { registerDefaultValidators, registerValidator } from '../src/forms/validators';
import { valueToString } from '../src/forms/field-value';
import type { FormSubmitFunction } from '../src/forms/types';

registerDefaultValidators();

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const noopSubmit: FormSubmitFunction = async () => {};

function mountForm(html: string, attrs: Record<string, string> = {}): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'f';
  for (const [k, v] of Object.entries(attrs)) form.setAttribute(k, v);
  form.innerHTML = html;
  document.body.append(form);
  return form;
}

function mountField(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html.trim();
  document.body.append(host);
  return host.firstElementChild as HTMLElement;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function leave(input: HTMLElement): void {
  input.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
}

afterEach(() => {
  document.body.innerHTML = '';
  setValidationMessages(undefined);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// A remote-style validator: "taken@example.com" is taken; resolves after a delay.
const calls: Array<{ value: string; signal: AbortSignal }> = [];
registerValidator(defineValidator({
  type: 'UniqueEmailAsync',
  async validate(value, _options, ctx) {
    calls.push({ value: valueToString(value), signal: ctx.signal });
    await tick(20);
    return valueToString(value) === 'taken@example.com' ? invalid('UniqueEmailAsync', 'Already registered.') : VALID;
  },
}));

describe('async validators', () => {
  const html = `<div data-form-field="email" data-validate='[{"type":"NotEmpty"},{"type":"UniqueEmailAsync"}]'>
    <input id="email" name="email"><p id="email-errors" class="invalid-feedback"></p></div>`;

  it('make form.validate() wait for them and fail', async () => {
    const form = mountForm(html);
    (form.querySelector('#email') as HTMLInputElement).value = 'taken@example.com';
    const ctrl = new FormController(form, noopSubmit);
    expect(await ctrl.validate()).toBe(false);
    expect(ctrl.getField('email')?.errors).toEqual(['Already registered.']);
  });

  it('set isValidating while running and notify the form when done', async () => {
    const form = mountForm(html);
    const input = form.querySelector<HTMLInputElement>('#email')!;
    const ctrl = new FormController(form, noopSubmit);
    const changes = vi.fn();
    ctrl.on('field:change', changes);

    type(input, 'taken@example.com');
    leave(input);
    expect(ctrl.getField('email')?.isValidating).toBe(true);
    expect(ctrl.getState().isValidating).toBe(true);

    await tick(40);
    expect(ctrl.getField('email')).toMatchObject({ isValidating: false, isValid: false, errors: ['Already registered.'] });
    expect(changes).toHaveBeenCalledTimes(2); // on blur, and when the async rule settled
  });

  it('abort the previous run and ignore its result', async () => {
    calls.length = 0;
    const field = new NativeField(mountField(html));
    const input = field.inputElement as HTMLInputElement;

    input.value = 'taken@example.com';
    const first = field.validate();
    input.value = 'free@example.com';
    const second = field.validate();

    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    await Promise.all([first, second]);
    expect(field.getState()).toMatchObject({ isValid: true, errors: [], isValidating: false });
  });

  it('block the submit until they settle', async () => {
    const form = mountForm(html + '<button type="submit">Send</button>');
    form.querySelector<HTMLInputElement>('#email')!.value = 'taken@example.com';
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    new FormController(form, submitFn);
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
    await tick(60);
    expect(submitFn).not.toHaveBeenCalled();
  });
});

describe('validator context', () => {
  it('gives validators other field values through ctx.form', async () => {
    const form = mountForm(`
      <div data-form-field="password"><input id="pw" name="password" value="secret123"></div>
      <div data-form-field="repeat" data-validate='[{"type":"Equals","options":{"field":"password"}}]'>
        <input id="repeat" name="repeat" value="secret124"></div>`);
    const ctrl = new FormController(form, noopSubmit);
    expect(await ctrl.validate()).toBe(false);
    expect(ctrl.getField('repeat')?.errors).toEqual(['The values don’t match.']);
  });

  it('passes files through ctx.files for custom string values', async () => {
    const seen = vi.fn();
    const field = new NativeField(mountField('<div data-form-field="f" data-validate=\'[{"type":"Spy"}]\'><input type="file" name="f"></div>'), {
      validators: [{ type: 'Spy', validate: (_v, _o, ctx) => { seen(ctx.files, ctx.field.name); return VALID; } }],
    });
    await field.validate();
    expect(seen).toHaveBeenCalledWith([], 'f');
  });
});

describe('dependent fields', () => {
  it('re-validate when the field they refer to changes', async () => {
    const form = mountForm(`
      <div data-form-field="password"><input id="pw" name="password"></div>
      <div data-form-field="repeat" data-validate='[{"type":"Equals","options":{"field":"password","message":"No match"}}]'>
        <input id="repeat" name="repeat"></div>`);
    const ctrl = new FormController(form, noopSubmit);
    const pw = form.querySelector<HTMLInputElement>('#pw')!;
    const repeat = form.querySelector<HTMLInputElement>('#repeat')!;

    type(pw, 'abcdefgh');
    type(repeat, 'abcdefgh');
    leave(repeat);
    expect(ctrl.getField('repeat')?.isValid).toBe(true);

    type(pw, 'zzzzzzzz');
    pw.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(ctrl.getField('repeat')?.errors).toEqual(['No match']);
  });

  it('are left alone until the user has been there', async () => {
    const form = mountForm(`
      <div data-form-field="start"><input id="start" name="start"></div>
      <div data-form-field="end" data-validate='[{"type":"DateNotBefore","options":{"field":"start"}}]'>
        <input id="end" name="end" value="2026-01-01"></div>`);
    const ctrl = new FormController(form, noopSubmit);
    const start = form.querySelector<HTMLInputElement>('#start')!;
    type(start, '2026-02-01');
    start.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(ctrl.getField('end')?.errors).toEqual([]);
    expect(await ctrl.validate()).toBe(false);
    expect(ctrl.getField('end')?.errors).toEqual(['Choose a later date.']);
  });
});

describe('form-level rules', () => {
  const html = `
    <div data-fl-form-errors tabindex="-1"></div>
    <div data-form-field="phone"><input id="phone" name="phone"></div>
    <div data-form-field="backupEmail"><input id="backup" name="backupEmail"></div>`;
  const rules = '[{"type":"AtLeastOne","options":{"fields":["phone","backupEmail"],"message":"Phone or backup email, please."}}]';

  it('run on validate, render into [data-fl-form-errors] and take focus', async () => {
    const form = mountForm(html, { 'data-validate-form': rules });
    const ctrl = new FormController(form, noopSubmit);
    expect(await ctrl.validate()).toBe(false);
    expect(ctrl.getState().formErrors).toEqual(['Phone or backup email, please.']);
    const container = form.querySelector<HTMLElement>('[data-fl-form-errors]')!;
    expect(container.textContent).toBe('Phone or backup email, please.');
    expect(document.activeElement).toBe(container);
  });

  it('clear as soon as the user fixes them', async () => {
    const form = mountForm(html, { 'data-validate-form': rules });
    const ctrl = new FormController(form, noopSubmit);
    await ctrl.validate();
    const phone = form.querySelector<HTMLInputElement>('#phone')!;
    type(phone, '+49 30 1234');
    phone.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(ctrl.getState().formErrors).toEqual([]);
    expect(ctrl.getState().isValid).toBe(true);
    expect(form.querySelector('[data-fl-form-errors]')!.textContent).toBe('');
  });
});

describe('messages', () => {
  const field = (attrs = '', options = {}) => new NativeField(mountField(
    `<div data-form-field="n" data-validate='[{"type":"StringLength","options":{"minimum":5${attrs}}}]'><input name="n" value="abc"></div>`,
  ), options);

  it('use the English default', async () => {
    expect((await field().validate()).errors).toEqual(['Must be at least 5 characters.']);
  });

  it('prefer global translations, with parameters', async () => {
    setValidationMessages({ 'StringLength.tooShort': 'Mindestens {minimum} Zeichen.' });
    expect((await field().validate()).errors).toEqual(['Mindestens 5 Zeichen.']);
  });

  it('prefer per-form translations over global ones', async () => {
    setValidationMessages({ 'StringLength.tooShort': 'global' });
    const f = field('', { messages: (key: string) => (key === 'StringLength.tooShort' ? 'local' : undefined) });
    expect((await f.validate()).errors).toEqual(['local']);
  });

  it('prefer the rule message from the server over everything', async () => {
    setValidationMessages({ 'StringLength.tooShort': 'global' });
    expect((await field(',"message":"From TYPO3"').validate()).errors).toEqual(['From TYPO3']);
  });
});

describe('defineValidator', () => {
  it('converts declared options from attribute strings', () => {
    const seen = vi.fn();
    const v = defineValidator({
      type: 'Typed',
      options: { minimum: Number, strict: Boolean, allowed: Array, label: String },
      validate(_value, options) {
        seen(options);
        return VALID;
      },
    });
    v.validate('', { minimum: '3', strict: 'true', allowed: 'a, b', label: 7, extra: 'x' }, undefined as never);
    expect(seen).toHaveBeenCalledWith({ minimum: 3, strict: true, allowed: ['a', 'b'], label: '7', extra: 'x' });
  });
});

describe('server-only and unknown rules', () => {
  it('are skipped without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const f = new NativeField(mountField(
      `<div data-form-field="e" data-validate='[{"type":"UniqueEmail","server":true},{"type":"TotallyUnknown"}]'><input name="e"></div>`,
    ));
    expect((await f.validate()).isValid).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('per-form validators', () => {
  it('are used for that form only, before the global registry', async () => {
    const form = mountForm(`<div data-form-field="code" data-validate='[{"type":"Local"}]'><input name="code" value="x"></div>`);
    const ctrl = new FormController(form, noopSubmit, {
      validators: [{ type: 'Local', validate: () => invalid('Local', 'Local rule failed') }],
    });
    expect(await ctrl.validate()).toBe(false);
    expect(ctrl.getField('code')?.errors).toEqual(['Local rule failed']);
  });
});

describe('triggers', () => {
  const html = (attr = '') =>
    `<div data-form-field="n" ${attr} data-validate='[{"type":"NotEmpty"},{"type":"StringLength","options":{"minimum":3}}]'><input name="n"></div>`;

  it('blur (default): leaving an untouched field shows nothing; leaving an edited one validates', () => {
    const f = new NativeField(mountField(html()));
    const input = f.inputElement as HTMLInputElement;
    leave(input);
    expect(f.getState().errors).toEqual([]);
    type(input, 'ab');
    leave(input);
    expect(f.getState().errors).toEqual(['Must be at least 3 characters.']);
  });

  it('blur (default): typing re-validates only while errors are shown, so they clear', () => {
    vi.useFakeTimers();
    const f = new NativeField(mountField(html()));
    const input = f.inputElement as HTMLInputElement;
    type(input, 'a');
    vi.advanceTimersByTime(400);
    expect(f.getState().errors).toEqual([]); // no error while typing
    leave(input);
    expect(f.getState().isValid).toBe(false);
    type(input, 'abc');
    vi.advanceTimersByTime(400);
    expect(f.getState().isValid).toBe(true);
  });

  it('change: validates while typing', () => {
    vi.useFakeTimers();
    const f = new NativeField(mountField(html('data-validate-on="change"')));
    type(f.inputElement as HTMLInputElement, 'a');
    vi.advanceTimersByTime(400);
    expect(f.getState().isValid).toBe(false);
  });

  it('submit: nothing until the form is submitted', async () => {
    const form = mountForm(html('data-validate-on="submit"'));
    const ctrl = new FormController(form, noopSubmit);
    const input = form.querySelector('input')!;
    type(input, 'a');
    leave(input);
    expect(ctrl.getField('n')?.errors).toEqual([]);
    expect(await ctrl.validate()).toBe(false);
  });
});
