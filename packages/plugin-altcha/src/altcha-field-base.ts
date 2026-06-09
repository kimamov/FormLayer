import { AbstractDomFormField } from 'formlayer';
import type { Configuration, State, WidgetMethods } from 'altcha/types';

type AltchaWidget = HTMLElement & WidgetMethods;

interface StateChangeDetail {
  state: State;
  payload?: string;
}

/**
 * Shared ALTCHA field base: mounts an `<altcha-widget>` beside a hidden input
 * and syncs the verified payload into form state.
 */
export abstract class AltchaFieldBase extends AbstractDomFormField {
  /** Assigned in mount(); `declare` avoids TS class-field init wiping it after super(). */
  declare protected hiddenInput: HTMLInputElement;
  private widget: AltchaWidget | null = null;
  private liveRegion: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private createdHiddenInput = false;
  private createdContainer = false;

  protected mount(): void {
    this.widget = this.findAltchaWidget();
    this.hiddenInput = this.resolveHiddenInput();
    this.setControlElement(this.hiddenInput);
    void this.initWidget();
  }

  protected readValue(): string {
    return this.hiddenInput.value;
  }

  protected writeValue(value: string): void {
    this.hiddenInput.value = value;
  }

  protected onDestroy(): void {
    if (this.createdContainer) {
      this.container?.remove();
    }
    if (this.createdHiddenInput) {
      this.hiddenInput?.remove();
    }
    this.widget = null;
    this.liveRegion = null;
    this.container = null;
  }

  /** Resolve the ALTCHA challenge (URL string or JSON object). */
  protected abstract resolveChallenge(): string | object | null;

  /**
   * Find a pre-rendered `<altcha-widget>` inside the wrapper or in the same form
   * (TYPO3 often uses a full `tx_form_formframework[...][identifier]` name).
   */
  protected findAltchaWidget(): AltchaWidget | null {
    const inWrapper = this.wrapper.querySelector('altcha-widget');
    if (inWrapper) return inWrapper as AltchaWidget;

    const form = this.wrapper.closest('form');
    if (!form) return null;

    const widgets = [...form.querySelectorAll('altcha-widget')];
    if (widgets.length === 0) return null;

    const match = widgets.find((widget) => this.widgetMatchesField(widget));
    if (match) return match as AltchaWidget;

    return widgets.length === 1 ? (widgets[0] as AltchaWidget) : null;
  }

  /** Match TYPO3 field names like `tx_form_formframework[form-1][altcha-1]`. */
  protected widgetMatchesField(widget: Element): boolean {
    const widgetName = widget.getAttribute('name');
    if (!widgetName) return false;
    if (widgetName === this.name) return true;
    if (widgetName.endsWith(`[${this.name}]`)) return true;

    const bracketed = widgetName.match(/\[([^\]]+)\]$/);
    return bracketed?.[1] === this.name;
  }

  private resolveHiddenInput(): HTMLInputElement {
    const byName = this.wrapper.querySelector<HTMLInputElement>(
      `input[type="hidden"][name="${CSS.escape(this.name)}"]`,
    );
    if (byName) return byName;

    // TYPO3: tx_form_formframework[form-1][field-id]
    const byBracketedName = this.wrapper.querySelector<HTMLInputElement>(
      `input[type="hidden"][name$="[${CSS.escape(this.name)}]"]`,
    );
    if (byBracketedName) return byBracketedName;

    const anyHidden = [...this.wrapper.querySelectorAll<HTMLInputElement>('input[type="hidden"]')]
      .find((input) => input.name !== '__altcha_nojs');
    if (anyHidden) return anyHidden;

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = this.name;
    input.value = '';
    this.wrapper.appendChild(input);
    this.createdHiddenInput = true;
    return input;
  }

  private async initWidget(): Promise<void> {
    try {
      await import('altcha');
      await this.loadI18n();
    } catch (err) {
      console.warn(`[FormsModule] AltchaField "${this.name}" failed to load altcha:`, err);
      return;
    }

    if (this.signal.aborted) return;

    if (this.widget) {
      this.bindWidget();
      return;
    }

    const challenge = this.resolveChallenge();
    if (challenge === null || !this.isValidChallenge(challenge)) {
      console.warn(
        `[FormsModule] AltchaField "${this.name}" has no challenge URL or JSON — `
        + 'ensure the TYPO3 partial renders `<altcha-widget challenge="...">` inside the '
        + '`[data-form-field]` wrapper, or set `data-altcha-challenge` on the wrapper/hidden input.',
      );
      return;
    }

    this.widget = document.createElement('altcha-widget') as AltchaWidget;
    this.applyChallenge(this.widget, challenge);

    this.widget.setAttribute('auto', 'onfocus');
    this.widget.setAttribute('hidelogo', 'true');
    this.widget.setAttribute('hidefooter', 'true');
    this.widget.setAttribute('name', `_altcha_internal_${this.name}`);

    const lang = this.detectLanguage();
    if (lang) {
      this.widget.setAttribute('language', lang);
    }

    this.liveRegion = document.createElement('span');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'visually-hidden';

    this.container = document.createElement('div');
    this.container.className = 'altcha-container';
    this.container.append(this.widget, this.liveRegion);
    this.createdContainer = true;

    this.hiddenInput.insertAdjacentElement('afterend', this.container);
    this.bindWidget();
  }

  private bindWidget(): void {
    if (!this.widget) return;
    const signal = this.signal;

    this.widget.addEventListener('statechange', (ev: Event) => {
      const detail = (ev as CustomEvent<StateChangeDetail>).detail;
      if (!detail) return;

      this.syncHiddenInputFromWidget();
      this.announceState(detail.state);

      if (detail.state === 'verified' && detail.payload) {
        this.markDirty();
        this.markTouched();
        this.setValue(detail.payload);
      } else {
        this.setValue('');
      }
    }, { signal });

    this.widget.addEventListener('verified', (ev: Event) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;

      const checkbox = target.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (checkbox) {
        checkbox.disabled = true;
      }

      this.syncHiddenInputFromWidget();
    }, { signal });
  }

  /** Copy the verified payload from ALTCHA's internal input into the form field input. */
  private syncHiddenInputFromWidget(): void {
    if (!this.widget) return;

    const widgetName = this.widget.getAttribute('name') ?? this.name;
    const widgetInput = this.findWidgetHiddenInput(widgetName);
    if (!widgetInput?.value || widgetInput === this.hiddenInput) return;

    this.hiddenInput.value = widgetInput.value;
  }

  private findWidgetHiddenInput(widgetName: string): HTMLInputElement | null {
    const selector = `input[type="hidden"][name="${CSS.escape(widgetName)}"]`;
    return (
      this.widget?.querySelector<HTMLInputElement>(selector)
      ?? this.wrapper.querySelector<HTMLInputElement>(selector)
      ?? this.widget?.closest('form')?.querySelector<HTMLInputElement>(selector)
      ?? null
    );
  }

  private isValidChallenge(challenge: string | object | null): boolean {
    if (!challenge) return false;
    if (typeof challenge === 'object') return true;
    if (challenge.startsWith('{')) return true;
    return challenge.startsWith('http') || challenge.startsWith('/');
  }

  private applyChallenge(widget: AltchaWidget, challenge: string | object): void {
    widget.setAttribute(
      'challenge',
      typeof challenge === 'string' ? challenge : JSON.stringify(challenge),
    );
  }

  private announceState(state: string): void {
    if (!this.liveRegion || !this.widget) return;

    try {
      if (typeof this.widget.getConfiguration === 'function') {
        const config = this.widget.getConfiguration() as Configuration & {
          strings?: Record<string, string>;
        };
        const strings = config.strings ?? {};
        this.liveRegion.textContent = strings[state] ?? '';
        return;
      }
    } catch { /* widget not yet ready */ }

    this.liveRegion.textContent = '';
  }

  protected detectLanguage(): string | null {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) {
      return htmlLang.split('-')[0].toLowerCase();
    }
    return null;
  }

  private async loadI18n(): Promise<void> {
    const lang = this.detectLanguage();
    if (!lang || lang === 'en') return;

    try {
      await import(`altcha/i18n/${lang}`);
    } catch {
      /* translation not available — widget falls back to English */
    }
  }
}
