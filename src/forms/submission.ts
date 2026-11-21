/**
 * What a submit function reports back, independent of any backend. Pass it
 * to `ctx.applyResult()`; adapters (like the TYPO3 one) map their server
 * responses onto it.
 *
 * Handled in this order:
 * 1. errors (`fields`, `form`) → shown, focus on the first problem;
 * 2. `redirect` → navigate;
 * 3. `finished` → the form is replaced by `message` (if any), focus moves to it;
 * 4. `html` → the form is replaced by new form markup (the next step),
 *    enhanced again, focus moves to its heading.
 */
export interface SubmissionResult {
  /** Field errors by field name (`data-form-field`). `[]` means valid. */
  fields?: Record<string, string[]>;
  /** Errors that belong to the form as a whole. */
  form?: string[];
  /** Navigate here. */
  redirect?: string | null;
  /** The submission is complete. */
  finished?: boolean;
  /** Markup replacing the form when finished (a confirmation). */
  message?: string | null;
  /** Markup of the next form (multistep): replaces the current form. */
  html?: string | null;
  /** Opaque server state (for example TYPO3's `__state`), for hooks and plugins. */
  state?: string | null;
}

export function hasErrors(result: SubmissionResult): boolean {
  return (result.form?.length ?? 0) > 0
    || Object.values(result.fields ?? {}).some((errors) => errors.length > 0);
}

/** Parse markup into nodes (not yet in the document). */
export function parseHtml(html: string): Node[] {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return Array.from(template.content.childNodes);
}

/** Elements among `nodes`, including their descendants, matching a selector. */
function findIn(nodes: Node[], selector: string): HTMLElement | null {
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.matches(selector)) return node;
    const inner = node.querySelector<HTMLElement>(selector);
    if (inner) return inner;
  }
  return null;
}

/** Focus an element, making it programmatically focusable first if needed. */
export function focusElement(el: HTMLElement | null): void {
  if (!el) return;
  const focusable = el.matches('a[href], button, input, select, textarea, [tabindex]') && !el.hasAttribute('disabled');
  if (!focusable) el.setAttribute('tabindex', '-1');
  el.focus();
}

/** The confirmation that replaced a form: `[data-form-success]`, a status/alert, or the first element. */
export function findConfirmation(nodes: Node[]): HTMLElement | null {
  return findIn(nodes, '[data-form-success]')
    ?? findIn(nodes, '[role="status"], [role="alert"]')
    ?? (nodes.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null);
}

/** Where focus goes in a newly swapped-in form: `[data-fl-step-heading]`, its first heading, or its first control. */
export function findStepFocusTarget(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('[data-fl-step-heading]')
    ?? form.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
    ?? form.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button');
}

/**
 * True if moving focus after a swap won't steal it from elsewhere: focus is
 * inside the old form, or nowhere in particular.
 */
export function focusWasIn(el: Element): boolean {
  const active = document.activeElement;
  return !active || active === document.body || el.contains(active);
}
