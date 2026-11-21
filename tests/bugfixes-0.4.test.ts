/**
 * Regression tests for the 0.4 bugfix release (issue #6).
 * Each block names the bug it guards against.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormController } from '../src/forms/form-controller';
import { FormRegistry } from '../src/forms/registry';
import { FieldController } from '../src/forms/field-controller';
import { AbstractDomFormField } from '../src/forms/abstract-dom-field';
import { isLazyFactory, lazy } from '../src/forms/create-field';
import { registerFieldType, unregisterFieldType } from '../src/forms/field-types';
import { initField } from '../src/forms/init-field';
import { getValidator, registerDefaultValidators, registerValidator, runValidators } from '../src/forms/validators';
import type { FormSubmitFunction, FormFieldClass } from '../src/forms/types';
import { detachedContext } from '../src/forms/validation';

registerDefaultValidators();

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function mountForm(html: string, id = 'f'): HTMLFormElement {
  const form = document.createElement('form');
  form.id = id;
  form.innerHTML = html;
  document.body.append(form);
  return form;
}

function submit(form: HTMLFormElement, submitter?: HTMLElement): void {
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, submitter: submitter ?? null }));
}

/** Custom field without its own constructor: `MyField.length === 0`. */
class NoCtorField extends AbstractDomFormField {
  private el!: HTMLInputElement;
  protected mount(): void {
    this.el = this.wrapper.querySelector('input')!;
    this.setControlElement(this.el);
  }
  protected readValue(): string {
    return this.el.value;
  }
  protected writeValue(value: string): void {
    this.el.value = value;
  }
}

const noopSubmit: FormSubmitFunction = async () => {};

afterEach(() => {
  document.body.innerHTML = '';
  unregisterFieldType('no-ctor');
  unregisterFieldType('lazy-field');
  vi.restoreAllMocks();
});

describe('lazy factory detection', () => {
  it('treats a field class without its own constructor as a class, not a lazy loader', async () => {
    expect(NoCtorField.length).toBe(0);
    expect(isLazyFactory(NoCtorField)).toBe(false);
  });

  it('treats lazy() and unwrapped zero-argument loaders as lazy', async () => {
    const loader = () => Promise.resolve({ default: NoCtorField as FormFieldClass });
    expect(isLazyFactory(lazy(loader))).toBe(true);
    expect(isLazyFactory(loader)).toBe(true);
  });

  it('creates a constructor-less field registered with registerFieldType', async () => {
    registerFieldType('no-ctor', NoCtorField);
    const form = mountForm('<div data-form-field="a" data-field-type="no-ctor"><input name="a" value="x"></div>');
    const ctrl = new FormController(form, noopSubmit);
    expect(ctrl.getField('a')?.value).toBe('x');
    ctrl.destroy();
  });

  it('creates a constructor-less field from a per-form fieldsMap', async () => {
    const form = mountForm('<div data-form-field="a" data-field-type="local"><input name="a" value="y"></div>');
    const ctrl = new FormController(form, noopSubmit, { fieldsMap: { local: NoCtorField } });
    expect(ctrl.getField('a')?.value).toBe('y');
    ctrl.destroy();
  });
});

describe('lazy fields', () => {
  it('pass the form fieldOptions to lazily loaded fields', async () => {
    const renderErrors = vi.fn();
    registerFieldType('lazy-field', lazy(async () => ({ default: NoCtorField as FormFieldClass })));
    const form = mountForm(`<div data-form-field="a" data-field-type="lazy-field" data-validate='[{"type":"NotEmpty"}]'><input name="a"></div>`);
    const ctrl = new FormController(form, noopSubmit, { fieldOptions: { renderErrors } });
    await ctrl.ready;
    await ctrl.validate();
    expect(renderErrors).toHaveBeenCalled();
    ctrl.destroy();
  });

  it('ready resolves after lazy fields are registered', async () => {
    registerFieldType('lazy-field', lazy(async () => {
      await tick(20);
      return { default: NoCtorField as FormFieldClass };
    }));
    const form = mountForm('<div data-form-field="a" data-field-type="lazy-field"><input name="a"></div>');
    const ctrl = new FormController(form, noopSubmit);
    expect(ctrl.getField('a')).toBeUndefined();
    await ctrl.ready;
    expect(ctrl.getField('a')).toBeDefined();
    ctrl.destroy();
  });

  it('validates a lazy field even when the form is submitted before it has loaded', async () => {
    registerFieldType('lazy-field', lazy(async () => {
      await tick(20);
      return { default: NoCtorField as FormFieldClass };
    }));
    const form = mountForm(`<div data-form-field="a" data-field-type="lazy-field" data-validate='[{"type":"NotEmpty"}]'><input name="a"></div>`);
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    const ctrl = new FormController(form, submitFn);

    submit(form);
    await tick(50);

    expect(submitFn).not.toHaveBeenCalled();
    expect(ctrl.getField('a')?.isValid).toBe(false);
    ctrl.destroy();
  });
});

describe('custom fields', () => {
  it('pass selected files to FileSize', async () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-form-field', 'upload');
    wrapper.setAttribute('data-validate', '[{"type":"FileSize","options":{"maximum":"1K"}}]');
    wrapper.innerHTML = '<input type="file" name="upload">';
    document.body.append(wrapper);
    const input = wrapper.querySelector('input')!;
    const big = new File([new Uint8Array(2048)], 'big.bin');
    Object.defineProperty(input, 'files', { value: [big] });
    Object.defineProperty(input, 'value', { value: 'C:\\fakepath\\big.bin' });

    const field = initField(wrapper, { field: NoCtorField });
    expect((await field.validate()).isValid).toBe(false);
  });
});

describe('registry', () => {
  it('unregisters a form when finish() destroys its controller', async () => {
    const registry = new FormRegistry();
    const unregistered = vi.fn();
    registry.on('form:unregistered', unregistered);
    const form = mountForm('<div data-form-field="a"><input name="a" value="x"></div>', 'done');
    registry.register(form, async (ctx) => ctx.finish('<p>Thanks</p>'));

    submit(form);
    await tick(10);

    expect(registry.get('done')).toBeUndefined();
    expect(unregistered).toHaveBeenCalledWith({ formId: 'done' });
  });

  it('still emits form:unregistered once on unregister()', async () => {
    const registry = new FormRegistry();
    const unregistered = vi.fn();
    registry.on('form:unregistered', unregistered);
    const form = mountForm('<div data-form-field="a"><input name="a"></div>', 'contact');
    registry.register(form, noopSubmit);
    registry.unregister('contact');
    registry.unregister('contact');
    expect(unregistered).toHaveBeenCalledTimes(1);
    expect(registry.get('contact')).toBeUndefined();
  });
});

describe('radio and checkbox groups', () => {
  it('react to a change on the 2nd radio', async () => {
    const form = mountForm(`
      <fieldset data-form-field="topic">
        <input type="radio" id="t1" name="topic" value="support">
        <input type="radio" id="t2" name="topic" value="sales">
      </fieldset>`);
    const ctrl = new FormController(form, noopSubmit);
    const changes = vi.fn();
    ctrl.on('field:change', changes);

    const second = form.querySelector<HTMLInputElement>('#t2')!;
    second.checked = true;
    second.dispatchEvent(new Event('change', { bubbles: true }));

    expect(ctrl.getField('topic')?.value).toBe('sales');
    expect(changes).toHaveBeenCalledTimes(1);
    ctrl.destroy();
  });

  it('react to a change on a later checkbox', async () => {
    const form = mountForm(`
      <fieldset data-form-field="interests">
        <input type="checkbox" id="i1" name="interests[]" value="design">
        <input type="checkbox" id="i2" name="interests[]" value="code">
      </fieldset>`);
    const ctrl = new FormController(form, noopSubmit);
    const second = form.querySelector<HTMLInputElement>('#i2')!;
    second.checked = true;
    second.dispatchEvent(new Event('change'));
    expect(ctrl.getField('interests')?.value).toEqual(['code']);
    ctrl.destroy();
  });

  it('do not count moving focus between options as leaving the field', async () => {
    const form = mountForm(`
      <fieldset data-form-field="topic" data-validate='[{"type":"NotEmpty"}]'>
        <input type="radio" id="t1" name="topic" value="support">
        <input type="radio" id="t2" name="topic" value="sales">
      </fieldset>`);
    const ctrl = new FormController(form, noopSubmit);
    const first = form.querySelector('#t1')!;
    const second = form.querySelector('#t2')!;
    first.dispatchEvent(new FocusEvent('blur', { relatedTarget: second }));
    expect(ctrl.getField('topic')?.isTouched).toBe(false);
    first.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
    expect(ctrl.getField('topic')?.isTouched).toBe(true);
    ctrl.destroy();
  });
});

describe('formnovalidate', () => {
  it('skips client validation when the submitter has formnovalidate', async () => {
    const form = mountForm(`
      <div data-form-field="a" data-validate='[{"type":"NotEmpty"}]'><input name="a"></div>
      <button type="submit" name="__nav" value="back" formnovalidate>Back</button>`);
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    const ctrl = new FormController(form, submitFn);

    submit(form, form.querySelector('button')!);
    await tick(10);

    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(submitFn.mock.calls[0][0].formData.get('__nav')).toBe('back');
    expect(ctrl.getField('a')?.errors).toEqual([]);
    ctrl.destroy();
  });

  it('still validates for a normal submit button', async () => {
    const form = mountForm(`
      <div data-form-field="a" data-validate='[{"type":"NotEmpty"}]'><input name="a"></div>
      <button type="submit">Next</button>`);
    const submitFn = vi.fn<FormSubmitFunction>(async () => {});
    const ctrl = new FormController(form, submitFn);
    submit(form, form.querySelector('button')!);
    await tick(10);
    expect(submitFn).not.toHaveBeenCalled();
    ctrl.destroy();
  });
});

describe('required stays exposed', () => {
  it('keeps native constraints inside a FormController form (novalidate)', async () => {
    const form = mountForm('<div data-form-field="a"><input name="a" required minlength="2"></div>');
    const ctrl = new FormController(form, noopSubmit);
    const input = form.querySelector('input')!;
    expect(form.noValidate).toBe(true);
    expect(input.hasAttribute('required')).toBe(true);
    expect(input.getAttribute('minlength')).toBe('2');
    ctrl.destroy();
  });

  it('mirrors a stripped required as aria-required on standalone fields and restores it', async () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-form-field', 'a');
    wrapper.innerHTML = '<input name="a" required>';
    document.body.append(wrapper);
    const ctrl = new FieldController(wrapper);
    const input = wrapper.querySelector('input')!;
    expect(input.hasAttribute('required')).toBe(false);
    expect(input.getAttribute('aria-required')).toBe('true');
    ctrl.destroy();
    expect(input.hasAttribute('required')).toBe(true);
    expect(input.hasAttribute('aria-required')).toBe(false);
  });
});

describe('TYPO3 validator parity', () => {
  it('Count checks the number of selected values', async () => {
    const count = getValidator('Count')!;
    expect(count.validate('', { minimum: 1 }, detachedContext())).toMatchObject({ valid: false });
    expect(count.validate('a', { minimum: 1, maximum: 2 }, detachedContext())).toMatchObject({ valid: true });
    expect(count.validate('a,b,c', { minimum: 1, maximum: 2 }, detachedContext())).toMatchObject({ valid: false });
    expect(count.validate('', { maximum: 2 }, detachedContext())).toMatchObject({ valid: true });
    expect(count.validate('', { minimum: 1, message: 'Pick one' }, detachedContext())).toMatchObject({ valid: false, message: 'Pick one' });
  });

  it('Count works on a checkbox group field', async () => {
    const form = mountForm(`
      <fieldset data-form-field="interests" data-validate='[{"type":"Count","options":{"minimum":1,"maximum":1}}]'>
        <input type="checkbox" id="i1" name="i[]" value="a">
        <input type="checkbox" id="i2" name="i[]" value="b">
      </fieldset>`);
    const ctrl = new FormController(form, noopSubmit);
    expect(await ctrl.validate()).toBe(false);
    form.querySelector<HTMLInputElement>('#i1')!.checked = true;
    form.querySelector<HTMLInputElement>('#i2')!.checked = true;
    expect(await ctrl.validate()).toBe(false);
    form.querySelector<HTMLInputElement>('#i2')!.checked = false;
    expect(await ctrl.validate()).toBe(true);
    ctrl.destroy();
  });

  it('MimeType checks the reported type of every selected file', async () => {
    const mimeType = getValidator('MimeType')!;
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    const check = (files: File[], allowedMimeTypes: unknown) => mimeType.validate(files, { allowedMimeTypes }, detachedContext());

    expect(check([], ['application/pdf'])).toMatchObject({ valid: true });
    expect(check([pdf], ['application/pdf'])).toMatchObject({ valid: true });
    expect(check([png], ['application/pdf', 'image/*'])).toMatchObject({ valid: true });
    expect(check([pdf, txt], 'application/pdf, image/*')).toMatchObject({ valid: false });
  });
});

describe('async validators', () => {
  it('are reported with console.error instead of being skipped silently', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerValidator({ type: 'AsyncNo', validate: async () => ({ valid: false, message: 'nope' }) });
    runValidators([{ type: 'AsyncNo' }], 'x');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Async validator "AsyncNo" was skipped'));
  });
});
