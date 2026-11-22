import { CSS_CLASSES } from './types';

export interface FieldErrorRenderContext {
  message: string;
  index: number;
  errors: string[];
}

export interface FieldErrorPresenterOptions<THost = unknown> {
  /** CSS selector scoped to the field wrapper. Used after id-based lookups, before the default class fallback. */
  errorsSelector?: string;
  /** Resolve the errors container. Takes precedence over errorsSelector and built-in lookups. */
  findErrorsElement?: (field: THost) => HTMLElement | null;
  /** Render a single error message as HTML. Used by default rendering; ignored when renderErrors is set. */
  renderError?: (ctx: FieldErrorRenderContext, field: THost) => string;
  /** Join rendered error fragments. Default: `<br/>`. Ignored when renderErrors is set. */
  errorsSeparator?: string;
  /** Replace the entire error rendering step. When set, renderError and errorsSeparator are ignored. */
  renderErrors?: (errors: string[], field: THost) => void;
  /** Class names to toggle; default `is-invalid` and `invalid-feedback`. */
  classes?: { invalid?: string; errorMessage?: string };
}

/**
 * Renders a field's errors and keeps the ARIA state of its controls in sync.
 *
 * The targets are the field's controls: one for most fields, every option for
 * radio and checkbox groups (so the error is announced whichever option has
 * focus). Targets start with `aria-invalid="false"`, which stops Firefox and
 * Safari from announcing empty required fields as invalid before interaction.
 */
export class FieldErrorPresenter<THost = unknown> {
  readonly errorsElement: HTMLElement | null;
  private readonly getTargets: () => HTMLElement[];

  constructor(
    private readonly wrapper: HTMLElement,
    targets: () => HTMLElement | HTMLElement[],
    private readonly host: THost,
    private readonly options: FieldErrorPresenterOptions<THost> = {},
  ) {
    this.getTargets = () => {
      const t = targets();
      return Array.isArray(t) ? t : [t];
    };
    this.errorsElement = this.findErrorsElement();
    for (const target of this.getTargets()) {
      if (!target.hasAttribute('aria-invalid')) target.setAttribute('aria-invalid', 'false');
    }
  }

  update(isValid: boolean, errors: string[]): void {
    const targets = this.getTargets();
    const invalidClass = this.options.classes?.invalid ?? CSS_CLASSES.errorClass;
    this.wrapper.classList.toggle(invalidClass, !isValid);

    for (const input of targets) {
      input.classList.toggle(invalidClass, !isValid);
      input.setAttribute('aria-invalid', isValid ? 'false' : 'true');
      if (isValid) {
        this.removeErrorsFromDescribedBy(input);
      } else {
        this.addErrorsToDescribedBy(input);
      }
    }

    if (this.options.renderErrors) {
      this.options.renderErrors(errors, this.host);
    } else if (this.errorsElement) {
      const separator = this.options.errorsSeparator ?? '<br/>';
      this.errorsElement.innerHTML = errors
        .map((msg, index) => {
          if (this.options.renderError) {
            return this.options.renderError({ message: msg, index, errors }, this.host);
          }
          return this.escapeHtml(msg);
        })
        .join(separator);
    }
  }

  private findErrorsElement(): HTMLElement | null {
    if (this.options.findErrorsElement) {
      return this.options.findErrorsElement(this.host);
    }

    const input = this.getTargets()[0];
    const uniqueId = input?.id;
    if (uniqueId) {
      const el = document.getElementById(`${uniqueId}-errors`);
      if (el) return el;
    }

    if (this.wrapper.id) {
      const el = document.getElementById(`${this.wrapper.id}-errors`);
      if (el) return el;
    }

    const groupContainer = this.wrapper.querySelector('[role="radiogroup"], [role="group"]');
    if (groupContainer?.id) {
      const el = document.getElementById(`${groupContainer.id}-errors`);
      if (el) return el;
    }

    if (this.options.errorsSelector) {
      const el = this.wrapper.querySelector<HTMLElement>(this.options.errorsSelector);
      if (el) return el;
    }

    return this.wrapper.querySelector(`.${this.options.classes?.errorMessage ?? CSS_CLASSES.errorMsgClass}`);
  }

  private addErrorsToDescribedBy(input: HTMLElement): void {
    if (!this.errorsElement?.id) return;
    const current = input.getAttribute('aria-describedby') ?? '';
    const ids = current.split(/\s+/).filter(Boolean);
    if (!ids.includes(this.errorsElement.id)) {
      ids.push(this.errorsElement.id);
      input.setAttribute('aria-describedby', ids.join(' '));
    }
  }

  private removeErrorsFromDescribedBy(input: HTMLElement): void {
    if (!this.errorsElement?.id) return;
    const current = input.getAttribute('aria-describedby') ?? '';
    const ids = current.split(/\s+/).filter((id) => id !== this.errorsElement!.id);
    if (ids.length > 0) {
      input.setAttribute('aria-describedby', ids.join(' '));
    } else {
      input.removeAttribute('aria-describedby');
    }
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
