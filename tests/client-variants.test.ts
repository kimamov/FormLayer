/**
 * Conditional logic in the client-variants plugin (issue #14): conditions on
 * containers, hidden fields reading as empty, chains settling, no flash.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormRegistry } from '../src/forms/registry';
import { registerDefaultValidators } from '../src/forms/validators';
import ClientVariantsPlugin from '../packages/plugin-client-variants/src/client-variants-plugin';
import type { FormSubmitFunction } from '../src/forms/types';

registerDefaultValidators();

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const cond = (expr: string) => `data-client-variants='${JSON.stringify([{ condition: expr, enabled: true }])}'`;

function setup(html: string, submitFn: FormSubmitFunction = async () => {}) {
  const form = document.createElement('form');
  form.id = 'f';
  form.innerHTML = html;
  document.body.append(form);
  const registry = new FormRegistry();
  registry.registerFormPlugin(ClientVariantsPlugin);
  const ctrl = registry.register(form, submitFn);
  return { form, ctrl };
}

function check(form: HTMLFormElement, selector: string, checked: boolean): void {
  const input = form.querySelector<HTMLInputElement>(selector)!;
  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function select(form: HTMLFormElement, selector: string, value: string): void {
  const el = form.querySelector<HTMLSelectElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('conditions on containers', () => {
  const html = `
    <div data-form-field="same"><input type="checkbox" id="same" name="same" value="1" checked></div>
    <fieldset id="shipping" ${cond('formValue("same") != "1"')}>
      <div data-form-field="shipping.name" data-validate='[{"type":"NotEmpty"}]'><input id="ship-name" name="shipping[name]"></div>
      <div data-form-field="shipping.city" data-validate='[{"type":"NotEmpty"}]'><input id="ship-city" name="shipping[city]"></div>
    </fieldset>
    <button type="submit">Go</button>`;

  it('hide the container and disable every field inside it', () => {
    const { form, ctrl } = setup(html);
    const fieldset = form.querySelector<HTMLFieldSetElement>('#shipping')!;
    expect(fieldset.hidden).toBe(true);
    expect(fieldset.getAttribute('aria-hidden')).toBe('true');
    expect(form.querySelector<HTMLInputElement>('#ship-name')!.disabled).toBe(true);
    expect(form.querySelector<HTMLInputElement>('[name="__clientVariantsDisabled"]')!.value.split(',').sort())
      .toEqual(['shipping.city', 'shipping.name']);

    check(form, '#same', false);
    expect(fieldset.hidden).toBe(false);
    expect(form.querySelector<HTMLInputElement>('#ship-name')!.disabled).toBe(false);
    expect(ctrl.getField('shipping.name')).toBeDefined();
  });

  it('keep hidden required fields from blocking the submit', async () => {
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    const { form } = setup(html, submitFn);
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, submitter: form.querySelector('button') }));
    await tick(10);
    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(submitFn.mock.calls[0][0].formData.has('shipping[name]')).toBe(false);
  });
});

describe('chained conditions', () => {
  const html = `
    <div data-form-field="hasCompany"><input type="checkbox" id="hc" name="hasCompany" value="1"></div>
    <div data-form-field="companySize" ${cond('formValue("hasCompany") == "1"')}>
      <select id="size" name="companySize"><option value=""></option><option value="large">Large</option></select>
    </div>
    <div data-form-field="manager" ${cond('formValue("companySize") == "large"')}>
      <input type="checkbox" id="mgr" name="manager" value="1">
    </div>`;

  it('treat hidden fields as empty, so dependent fields hide too', () => {
    const { form } = setup(html);
    const manager = form.querySelector<HTMLElement>('[data-form-field="manager"]')!;

    check(form, '#hc', true);
    select(form, '#size', 'large');
    expect(manager.hidden).toBe(false);

    check(form, '#hc', false);
    expect(form.querySelector<HTMLElement>('[data-form-field="companySize"]')!.hidden).toBe(true);
    expect(manager.hidden).toBe(true);

    check(form, '#hc', true);
    expect(manager.hidden).toBe(false); // company size kept its value
  });

  it('stop on circular conditions with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setup(`
      <div data-form-field="a" ${cond('formValue("b") == ""')}><input name="a" value="x"></div>
      <div data-form-field="b" ${cond('formValue("a") == ""')}><input name="b" value="y"></div>`);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not settle'));
  });
});

describe('no flash on load', () => {
  it('evaluates synchronously during registration and marks elements as evaluated', () => {
    const { form } = setup(`
      <div data-form-field="pref"><input type="radio" id="p1" name="pref" value="email"><input type="radio" id="p2" name="pref" value="phone"></div>
      <div data-form-field="phone" ${cond('formValue("pref") == "phone"')}><input name="phone"></div>`);
    // No await: hidden as soon as register() returns.
    const phone = form.querySelector<HTMLElement>('[data-form-field="phone"]')!;
    expect(phone.hidden).toBe(true);
    expect(phone.hasAttribute('data-fl-evaluated')).toBe(true);
  });
});
