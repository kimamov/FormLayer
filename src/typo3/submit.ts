import type { FormSubmitFunction } from '../forms/types';
import type { SubmissionResult } from '../forms/submission';
import type { Typo3AjaxFormResponse, Typo3FormsHooks } from './types';

function updateHiddenField(formEl: HTMLFormElement, selector: string, value: string): void {
  const input = formEl.querySelector<HTMLInputElement>(selector);
  if (input) {
    input.value = value;
  }
}

/** TYPO3 sets `data-ajax="1"` only when AJAX submission is enabled; all other values use native POST. */
export function isTypo3AjaxSubmitEnabled(formEl: HTMLFormElement): boolean {
  const value = formEl.dataset.ajax;
  return value === '1' || value === 'true';
}

/**
 * Split TYPO3 errors into field errors and form-level errors (`__form` or `""`).
 * Keys may be identifiers or full names (`tx_form_formframework[form-1][email]`).
 */
export function typo3ErrorsToResult(errors: Record<string, string[]> | undefined): Pick<SubmissionResult, 'fields' | 'form'> {
  const fields: Record<string, string[]> = {};
  const form: string[] = [];
  for (const [key, messages] of Object.entries(errors ?? {})) {
    const list = Array.isArray(messages) ? messages : [];
    if (key === '__form' || key === '') {
      form.push(...list);
      continue;
    }
    const name = key.match(/\[([^\]]+)\]$/)?.[1] ?? key;
    (fields[name] ??= []).push(...list);
  }
  return { fields, form };
}

/**
 * Submit function for TYPO3 EXT:form with the sitepackage's
 * `AjaxFormSubmitMiddleware`. Maps the JSON response onto a
 * `SubmissionResult` and lets the form apply it (errors, redirect,
 * confirmation, or the next step's markup).
 */
export function createTypo3Submit(hooks?: Typo3FormsHooks): FormSubmitFunction {
  return async (ctx) => {
    const { formEl, formData, signal, fallbackToNative } = ctx;

    if (hooks?.onBeforeSubmit?.(ctx) === false) {
      return;
    }

    if (!isTypo3AjaxSubmitEnabled(formEl)) {
      fallbackToNative();
      return;
    }

    let response: Response;
    try {
      response = await fetch(formEl.action, {
        method: 'POST',
        headers: { 'X-Form-Ajax': '1' },
        body: formData,
        signal,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('[FormLayer] AJAX submit failed:', err);
        hooks?.onSubmitError?.(err as Error, formEl);
        fallbackToNative();
      }
      return;
    }

    if (!response.ok) {
      const err = new Error(`Server responded with ${response.status}`);
      console.warn(`[FormLayer] ${err.message}, falling back to normal submit`);
      hooks?.onSubmitError?.(err, formEl);
      fallbackToNative();
      return;
    }

    let data: Typo3AjaxFormResponse;
    try {
      data = await response.json();
    } catch {
      console.warn('[FormLayer] Invalid JSON response, falling back to normal submit');
      hooks?.onSubmitError?.(new Error('Invalid JSON response'), formEl);
      fallbackToNative();
      return;
    }

    hooks?.onAfterSubmit?.(data, formEl);

    if (!data.valid) {
      if (data.state) {
        updateHiddenField(formEl, 'input[name$="[__state]"]', data.state);
      }
      ctx.applyResult({ ...typo3ErrorsToResult(data.errors), state: data.state });
      hooks?.onValidationError?.(data.errors, formEl);
      return;
    }

    if (data.finished) {
      hooks?.onFormFinished?.(data, formEl);
      ctx.applyResult(data.redirect
        ? { redirect: data.redirect }
        : { finished: true, message: data.message, state: data.state });
      return;
    }

    if (data.html) {
      const newFormEl = ctx.applyResult({ html: data.html, state: data.state });
      hooks?.onStepChange?.(data.page, newFormEl ?? formEl);
      return;
    }

    if (data.state) {
      updateHiddenField(formEl, 'input[name$="[__state]"]', data.state);
    }
    hooks?.onStepChange?.(data.page, formEl);
  };
}
