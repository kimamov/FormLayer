/**
 * The v2 field core (issue #8): BaseField via defineField(), NativeField typed
 * values, ARIA state, enable/disable and the html helper.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineField } from '../src/forms/define-field';
import { NativeField } from '../src/forms/native-field';
import { FormController } from '../src/forms/form-controller';
import { registerFieldType, unregisterFieldType } from '../src/forms/field-types';
import { isLazyFactory } from '../src/forms/create-field';
import { initField } from '../src/forms/init-field';
import { html, raw } from '../src/forms/html';
import { getValidator, registerDefaultValidators } from '../src/forms/validators';
import type { FieldContext } from '../src/forms/base-field';
import type { FormSubmitFunction } from '../src/forms/types';

registerDefaultValidators();

const noopSubmit: FormSubmitFunction = async () => {};

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html.trim();
  document.body.append(host);
  return host.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
  unregisterFieldType('rating');
  vi.useRealTimers();
});

/** A star rating made of buttons, storing its value in a hidden input. */
const RatingField = defineField({
  setup(ctx) {
    const hidden = ctx.part<HTMLInputElement>('value');
    const stars = ctx.parts<HTMLButtonElement>('star');
    ctx.setControl(stars);
    for (const star of stars) {
      star.addEventListener('click', () => {
        hidden.value = star.value;
        ctx.commit();
      }, { signal: ctx.signal });
    }
    return {
      read: () => hidden.value,
      write: (value) => { hidden.value = String(value); },
    };
  },
});

const ratingMarkup = `
  <fieldset data-form-field="rating" data-field-type="rating" data-validate='[{"type":"NotEmpty","options":{"message":"Rate us"}}]'>
    <input type="hidden" name="rating" data-fl-part="value">
    <button type="button" data-fl-part="star" value="1">1</button>
    <button type="button" data-fl-part="star" value="2">2</button>
    <p class="invalid-feedback" id="rating-errors"></p>
  </fieldset>`;

describe('defineField()', () => {
  it('creates a working field from setup()', () => {
    const wrapper = mount(ratingMarkup);
    const field = new RatingField(wrapper);
    expect(field.getState()).toMatchObject({ name: 'rating', value: '', isDirty: false, isTouched: false });

    wrapper.querySelectorAll('button')[1].click();
    expect(field.getState()).toMatchObject({ value: '2', isDirty: true, isTouched: true, isValid: true });
  });

  it('is a class, so it can be registered directly', () => {
    expect(isLazyFactory(RatingField)).toBe(false);
    registerFieldType('rating', RatingField);
    const form = document.createElement('form');
    form.id = 'f';
    form.innerHTML = ratingMarkup;
    document.body.append(form);
    const ctrl = new FormController(form, noopSubmit);
    expect(ctrl.getField('rating')).toBeDefined();
    ctrl.destroy();
  });

  it('validates with data-validate rules and renders errors', () => {
    const wrapper = mount(ratingMarkup);
    const field = new RatingField(wrapper);
    expect(field.validate()).toEqual({ isValid: false, errors: ['Rate us'] });
    expect(wrapper.querySelector('#rating-errors')!.textContent).toBe('Rate us');
  });

  it('links errors to every element passed to setControl()', () => {
    const wrapper = mount(ratingMarkup);
    const field = new RatingField(wrapper);
    const stars = wrapper.querySelectorAll('button');
    expect(stars[0].getAttribute('aria-invalid')).toBe('false');
    field.validate();
    for (const star of stars) {
      expect(star.getAttribute('aria-invalid')).toBe('true');
      expect(star.getAttribute('aria-describedby')).toContain('rating-errors');
    }
  });

  it('input() validates only after a pause and only once touched', () => {
    vi.useFakeTimers();
    let ctxRef!: FieldContext;
    const Field = defineField({
      setup(ctx) {
        ctxRef = ctx;
        const input = ctx.control<HTMLInputElement>();
        return { read: () => input.value, write: (v) => { input.value = String(v); } };
      },
    });
    const wrapper = mount(`<div data-form-field="x" data-validate='[{"type":"NotEmpty"}]'><input name="x"></div>`);
    const field = new Field(wrapper);
    const changes = vi.fn();
    field.on('change', changes);

    ctxRef.input();
    expect(field.getState().isDirty).toBe(true);
    vi.advanceTimersByTime(400);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(field.getState().errors).toEqual([]); // not touched yet

    ctxRef.touch();
    expect(field.getState().isValid).toBe(false);
  });

  it('reset() writes the initial value unless the adapter has its own reset', () => {
    const wrapper = mount(ratingMarkup);
    const field = new RatingField(wrapper);
    field.setValue('2');
    expect(field.getState().value).toBe('2');
    field.reset();
    expect(field.getState()).toMatchObject({ value: '', isDirty: false, isTouched: false });
  });

  it('destroy() aborts the signal and calls the adapter destroy hook', () => {
    const destroyed = vi.fn();
    let signal!: AbortSignal;
    const Field = defineField({
      setup(ctx) {
        signal = ctx.signal;
        const input = ctx.control<HTMLInputElement>();
        return { read: () => input.value, write: () => {}, destroy: destroyed };
      },
    });
    const field = new Field(mount('<div data-form-field="x"><input name="x"></div>'));
    field.destroy();
    expect(signal.aborted).toBe(true);
    expect(destroyed).toHaveBeenCalledTimes(1);
  });

  it('ctx.part() explains which part is missing', () => {
    const Field = defineField({
      setup(ctx) {
        ctx.part('listbox');
        return { read: () => '', write: () => {} };
      },
    });
    expect(() => new Field(mount('<div data-form-field="x"><input></div>'))).toThrow('data-fl-part="listbox"');
  });

  it('works with initField() for standalone use', () => {
    const wrapper = mount(ratingMarkup);
    const field = initField(wrapper, { field: RatingField });
    expect(field.getState().name).toBe('rating');
  });
});

describe('NativeField typed values', () => {
  it('reads a checkbox group as string[]', () => {
    const wrapper = mount(`
      <fieldset data-form-field="i">
        <input type="checkbox" name="i[]" value="a" checked>
        <input type="checkbox" name="i[]" value="b">
        <input type="checkbox" name="i[]" value="c" checked>
      </fieldset>`);
    const field = new NativeField(wrapper);
    expect(field.getState().value).toEqual(['a', 'c']);
    field.setValue(['b']);
    expect([...wrapper.querySelectorAll<HTMLInputElement>('input')].map((i) => i.checked)).toEqual([false, true, false]);
  });

  it('treats a single checkbox named with [] as a group', () => {
    const field = new NativeField(mount('<div data-form-field="t"><input type="checkbox" name="t[]" value="yes"></div>'));
    expect(field.getState().value).toEqual([]);
  });

  it('reads a single checkbox and a radio group as string', () => {
    const box = new NativeField(mount('<div data-form-field="c"><input type="checkbox" name="c" value="1" checked></div>'));
    expect(box.getState().value).toBe('1');
    const radios = new NativeField(mount(`
      <fieldset data-form-field="r">
        <input type="radio" name="r" value="a"><input type="radio" name="r" value="b" checked>
      </fieldset>`));
    expect(radios.getState().value).toBe('b');
    radios.setValue('a');
    expect(radios.getState().value).toBe('a');
  });

  it('reads a multi-select as string[]', () => {
    const field = new NativeField(mount(`
      <div data-form-field="m"><select name="m" multiple>
        <option value="x" selected>X</option><option value="y">Y</option><option value="z" selected>Z</option>
      </select></div>`));
    expect(field.getState().value).toEqual(['x', 'z']);
    field.setValue(['y']);
    expect(field.getState().value).toEqual(['y']);
  });

  it('reads a file input as File[]', () => {
    const wrapper = mount('<div data-form-field="f"><input type="file" name="f"></div>');
    const input = wrapper.querySelector('input')!;
    const file = new File(['x'], 'a.txt');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    const field = new NativeField(wrapper);
    expect(field.getState().value).toEqual([file]);
  });

  it('links a radio group error to every option', () => {
    const wrapper = mount(`
      <fieldset data-form-field="r" data-validate='[{"type":"NotEmpty"}]'>
        <input type="radio" id="r1" name="r" value="a"><input type="radio" id="r2" name="r" value="b">
        <p id="r-errors" class="invalid-feedback"></p>
      </fieldset>`);
    const field = new NativeField(wrapper);
    field.validate();
    expect(wrapper.querySelector('#r2')!.getAttribute('aria-describedby')).toBe('r-errors');
    expect(wrapper.querySelector('#r2')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('starts with aria-invalid="false" and returns to it once valid', () => {
    const wrapper = mount(`<div data-form-field="n" data-validate='[{"type":"NotEmpty"}]'><input id="n" name="n"></div>`);
    const input = wrapper.querySelector('input')!;
    const field = new NativeField(wrapper);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    field.validate();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    input.value = 'ok';
    field.validate();
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('setEnabled()', () => {
  it('disables every control and restores only the ones it disabled', () => {
    const wrapper = mount(`
      <div data-form-field="g">
        <input name="g" value="1">
        <input name="other" disabled>
        <button type="button">Help</button>
      </div>`);
    const field = new NativeField(wrapper);
    const [first, other] = wrapper.querySelectorAll('input');
    const button = wrapper.querySelector('button')!;

    field.setEnabled(false);
    expect(wrapper.hidden).toBe(true);
    expect(first.disabled && other.disabled && button.disabled).toBe(true);

    field.setEnabled(true);
    expect(first.disabled).toBe(false);
    expect(button.disabled).toBe(false);
    expect(other.disabled).toBe(true);
  });
});

describe('validators with typed values', () => {
  it('NotEmpty treats an empty list as empty', () => {
    const notEmpty = getValidator('NotEmpty')!;
    expect(notEmpty.validate([], {})).toMatchObject({ valid: false });
    expect(notEmpty.validate(['a'], {})).toMatchObject({ valid: true });
  });

  it('Count counts list values', () => {
    const count = getValidator('Count')!;
    expect(count.validate(['a', 'b', 'c'], { maximum: 2 })).toMatchObject({ valid: false });
  });

  it('FileSize reads files from a File[] value', () => {
    const fileSize = getValidator('FileSize')!;
    const big = new File([new Uint8Array(2048)], 'big.bin');
    expect(fileSize.validate([big], { maximum: '1K' })).toMatchObject({ valid: false });
  });

  it('string validators get list values joined with commas', () => {
    const length = getValidator('StringLength')!;
    expect(length.validate(['ab', 'cd'], { maximum: 4 })).toMatchObject({ valid: false }); // "ab,cd"
  });
});

describe('html``', () => {
  const render = (fragment: DocumentFragment) => {
    const div = document.createElement('div');
    div.append(fragment);
    return div.innerHTML;
  };

  it('escapes interpolated strings in text and attributes', () => {
    const label = '<b>"Tom" & Jerry</b>';
    expect(render(html`<li title="${label}">${label}</li>`))
      .toBe('<li title="<b>&quot;Tom&quot; &amp; Jerry</b>">&lt;b&gt;"Tom" &amp; Jerry&lt;/b&gt;</li>');
  });

  it('inserts nodes as nodes, keeping their identity', () => {
    const icon = document.createElement('span');
    const onClick = vi.fn();
    icon.addEventListener('click', onClick);
    const div = document.createElement('div');
    div.append(html`<p>${icon} Germany</p>`);
    expect(div.querySelector('p span')).toBe(icon);
    icon.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('supports arrays, raw markup and skips null/false', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    expect(render(html`<ul>${items}</ul>${null}${false}${raw('<hr>')}`)).toBe('<ul><li>a</li><li>b</li></ul><hr>');
  });
});
