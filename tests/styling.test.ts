/**
 * Error rendering and styling (issue #13): live region announcements,
 * configurable classes, the error summary and the CSS packaging.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FormController } from '../src/forms/form-controller';
import { registerDefaultValidators } from '../src/forms/validators';
import type { FormSubmitFunction } from '../src/forms/types';

registerDefaultValidators();

const noopSubmit: FormSubmitFunction = async () => {};
const root = resolve(import.meta.dirname, '..');

function mountForm(html: string): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'f';
  form.innerHTML = html;
  document.body.append(form);
  return form;
}

const emailField = `<div data-form-field="email" data-validate='[{"type":"EmailAddress"}]'>
  <label for="email">Email <span aria-hidden="true">*</span></label>
  <input id="email" name="email" type="email">
  <p id="email-errors" class="invalid-feedback"></p>
</div>`;

const liveRegion = () => document.querySelector<HTMLElement>('[data-fl-live-region]');

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function leave(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('blur'));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('live region', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('announces an error that appears on blur, after a delay, with the field label', async () => {
    const form = mountForm(emailField);
    new FormController(form, noopSubmit);
    const input = form.querySelector<HTMLInputElement>('#email')!;
    type(input, 'not-an-email');
    leave(input);
    await vi.advanceTimersByTimeAsync(10);
    expect(liveRegion()?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion()?.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(600);
    expect(liveRegion()?.textContent).toMatch(/^Email: /);
    expect(document.querySelectorAll('[data-fl-live-region]')).toHaveLength(1);
  });

  it('clears the announcement once the field is fixed', async () => {
    const form = mountForm(emailField);
    new FormController(form, noopSubmit);
    const input = form.querySelector<HTMLInputElement>('#email')!;
    type(input, 'nope');
    leave(input);
    await vi.advanceTimersByTimeAsync(600);
    expect(liveRegion()?.textContent).not.toBe('');
    type(input, 'ada@example.com');
    await vi.advanceTimersByTimeAsync(600);
    expect(liveRegion()?.textContent).toBe('');
  });

  it('does not announce while typing or after a failed validate()', async () => {
    const form = mountForm(emailField);
    const ctrl = new FormController(form, noopSubmit);
    const input = form.querySelector<HTMLInputElement>('#email')!;
    type(input, 'nope');
    await vi.advanceTimersByTimeAsync(600);
    expect(liveRegion()?.textContent ?? '').toBe('');
    await ctrl.validate();
    await vi.advanceTimersByTimeAsync(600);
    expect(liveRegion()?.textContent ?? '').toBe('');
  });

  it('can be switched off with announceErrors: false', async () => {
    const form = mountForm(emailField);
    new FormController(form, noopSubmit, { fieldOptions: { announceErrors: false } });
    const input = form.querySelector<HTMLInputElement>('#email')!;
    type(input, 'nope');
    leave(input);
    await vi.advanceTimersByTimeAsync(600);
    expect(liveRegion()?.textContent ?? '').toBe('');
  });
});

describe('classes', () => {
  it('uses the configured invalid and error message classes', async () => {
    const form = mountForm(emailField.replace('class="invalid-feedback"', 'class="error-text"'));
    const ctrl = new FormController(form, noopSubmit, { classes: { invalid: 'has-error', errorMessage: 'error-text' } });
    form.querySelector<HTMLInputElement>('#email')!.value = 'nope';
    await ctrl.validate();
    const input = form.querySelector<HTMLInputElement>('#email')!;
    expect(input.classList.contains('has-error')).toBe(true);
    expect(input.classList.contains('is-invalid')).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(form.querySelector('.error-text')!.textContent).not.toBe('');
    expect(input.getAttribute('aria-describedby')).toContain('email-errors');
  });
});

describe('error summary', () => {
  const html = `<div data-fl-error-summary data-fl-error-summary-title="Please fix"></div>
    <div data-form-field="name" data-validate='[{"type":"NotEmpty"}]'><label for="name">Name</label><input id="name" name="name"></div>
    ${emailField}`;

  it('lists each problem with a link, focuses the summary and clears when fixed', async () => {
    const form = mountForm(html);
    const ctrl = new FormController(form, noopSubmit);
    form.querySelector<HTMLInputElement>('#email')!.value = 'nope';
    expect(await ctrl.validate()).toBe(false);

    const summary = form.querySelector<HTMLElement>('[data-fl-error-summary]')!;
    expect(summary.querySelector('h2')!.textContent).toBe('Please fix');
    const links = [...summary.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#name', '#email']);
    expect(links[1].textContent).toMatch(/^Email: /);
    expect(document.activeElement).toBe(summary);

    links[1].click();
    expect(document.activeElement).toBe(form.querySelector('#email'));

    form.querySelector<HTMLInputElement>('#name')!.value = 'Ada';
    form.querySelector<HTMLInputElement>('#email')!.value = 'ada@example.com';
    expect(await ctrl.validate()).toBe(true);
    expect(summary.innerHTML).toBe('');
  });

  it('escapes messages', async () => {
    const form = mountForm(`<div data-fl-error-summary></div>
      <div data-form-field="x" data-validate='[{"type":"NotEmpty","message":"<b>x</b>"}]'><input id="x" name="x"></div>`);
    const ctrl = new FormController(form, noopSubmit);
    await ctrl.validate();
    expect(form.querySelector('[data-fl-error-summary] b')).toBeNull();
  });
});

describe('CSS packaging', () => {
  const css = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const rules = (source: string) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((block) => block.split('{')[0].trim())
    .filter((sel) => sel && !sel.startsWith('@') && !/^(from|to|\d+%)$/.test(sel));

  const topLevel = (selector: string) => {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of selector) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
    }
    return [...parts, current].map((p) => p.trim()).filter(Boolean);
  };

  it.each(['src/forms/base.css', 'src/forms/theme.css', 'packages/plugin-combobox/src/style.css', 'packages/plugin-altcha/src/style.css'])(
    '%s has zero-specificity selectors only',
    (path) => {
      for (const selector of rules(css(path))) {
        for (const part of topLevel(selector)) {
          expect(part.trim(), `${path}: ${selector}`).toMatch(/^:where\(/);
        }
      }
    },
  );

  it('forms.css is an alias for base.css and theme.css', () => {
    expect(css('src/forms/forms.css')).toMatch(/@import '\.\/base\.css';\s*@import '\.\/theme\.css';/);
  });

  it('packages export their styles', () => {
    const core = JSON.parse(css('package.json'));
    expect(Object.keys(core.exports)).toEqual(expect.arrayContaining(['./base.css', './theme.css', './forms.css']));
    for (const plugin of ['plugin-combobox', 'plugin-altcha']) {
      const pkg = JSON.parse(css(`packages/${plugin}/package.json`));
      expect(pkg.exports['./style.css']).toBeDefined();
      expect(existsSync(resolve(root, `packages/${plugin}/src/style.css`))).toBe(true);
    }
  });
});

describe('pressing a submit button', () => {
  const html = `<div data-form-field="n" data-validate='[{"type":"NotEmpty"}]'><input id="n" name="n" value="x"><p class="invalid-feedback"></p></div>
    <button type="submit" formnovalidate id="back">Back</button><button type="submit" id="next">Next</button>`;

  function pressAndLeave(form: HTMLFormElement, button: string): HTMLInputElement {
    const input = form.querySelector<HTMLInputElement>('#n')!;
    type(input, '');
    form.querySelector(button)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    leave(input);
    return input;
  }

  it('holds back blur errors so the layout does not shift under the pointer', async () => {
    const form = mountForm(html);
    new FormController(form, noopSubmit);
    const input = pressAndLeave(form, '#back');
    await new Promise((r) => setTimeout(r, 10));
    expect(input.getAttribute('aria-invalid')).toBe('false');
    form.querySelector('#back')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(input.getAttribute('aria-invalid')).toBe('false'); // formnovalidate: never
  });

  it('validates after the release when the click did not submit', async () => {
    const form = mountForm(html);
    new FormController(form, noopSubmit);
    const input = pressAndLeave(form, '#next');
    await new Promise((r) => setTimeout(r, 10));
    expect(input.getAttribute('aria-invalid')).toBe('false');
    document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
