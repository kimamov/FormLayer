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
  protected hiddenInput!: HTMLInputElement;
  private widget: AltchaWidget | null = null;
  private liveRegion: HTMLElement | null = null;
  private container: HTMLElement | null = null;

  protected mount(): void {
    const input = this.wrapper.querySelector<HTMLInputElement>('input[type="hidden"]');
    if (!input) {
      throw new Error(`[FormsModule] AltchaField "${this.name}" requires a hidden input`);
    }
    this.hiddenInput = input;
    this.setControlElement(input);
    void this.initWidget();
  }

  protected readValue(): string {
    return this.hiddenInput.value;
  }

  protected writeValue(value: string): void {
    this.hiddenInput.value = value;
  }

  protected onDestroy(): void {
    this.container?.remove();
    this.widget = null;
    this.liveRegion = null;
    this.container = null;
  }

  /** Resolve the ALTCHA challenge (URL string or JSON object). */
  protected abstract resolveChallenge(): string | object | null;

  private async initWidget(): Promise<void> {
    try {
      await import('altcha');
      await this.loadI18n();
    } catch (err) {
      console.warn(`[FormsModule] AltchaField "${this.name}" failed to load altcha:`, err);
      return;
    }

    const challenge = this.resolveChallenge();

    this.widget = document.createElement('altcha-widget') as AltchaWidget;

    if (typeof challenge === 'string' && challenge.startsWith('http')) {
      this.widget.setAttribute('challenge', challenge);
    } else if (challenge) {
      this.widget.setAttribute(
        'challenge',
        typeof challenge === 'string' ? challenge : JSON.stringify(challenge),
      );
    }

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

    this.hiddenInput.insertAdjacentElement('afterend', this.container);
    this.bindWidget();
  }

  private bindWidget(): void {
    if (!this.widget) return;
    const signal = this.signal;

    this.widget.addEventListener('statechange', (ev: Event) => {
      const detail = (ev as CustomEvent<StateChangeDetail>).detail;
      if (!detail) return;

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
    }, { signal });
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
