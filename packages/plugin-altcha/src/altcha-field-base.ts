import { defineField } from 'formlayer';
import type { DefinedFieldClass } from 'formlayer';
import type { Configuration, State, WidgetMethods } from 'altcha/types';

type AltchaWidget = HTMLElement & WidgetMethods;

interface StateChangeDetail {
  state: State;
  payload?: string;
}

/** What a challenge resolver gets to look at. */
export interface AltchaChallengeContext {
  wrapper: HTMLElement;
  hiddenInput: HTMLInputElement;
  /** A pre-rendered `<altcha-widget>` for this field, if any. */
  widget: HTMLElement | null;
}

/** Resolve the ALTCHA challenge: a URL string, a JSON string or an object. */
export type AltchaChallengeResolver = (ctx: AltchaChallengeContext) => string | object | null;

/**
 * Build an ALTCHA field type: mounts an `<altcha-widget>` beside a hidden input
 * and syncs the verified payload into the field value. Variants only differ in
 * how they find the challenge.
 */
export function createAltchaField(resolveChallenge: AltchaChallengeResolver): DefinedFieldClass {
  return defineField({
    setup(ctx) {
      const { wrapper, name, signal } = ctx;
      let widget = findAltchaWidget(wrapper, name);
      let liveRegion: HTMLElement | null = null;
      let container: HTMLElement | null = null;
      const hidden = resolveHiddenInput(wrapper, name);
      const hiddenInput = hidden.input;

      ctx.setControl(hiddenInput);

      const setPayload = (payload: string) => {
        hiddenInput.value = payload;
        ctx.commit();
      };

      const syncHiddenInputFromWidget = () => {
        if (!widget) return;
        const widgetName = widget.getAttribute('name') ?? name;
        const selector = `input[type="hidden"][name="${CSS.escape(widgetName)}"]`;
        const widgetInput = widget.querySelector<HTMLInputElement>(selector)
          ?? wrapper.querySelector<HTMLInputElement>(selector)
          ?? widget.closest('form')?.querySelector<HTMLInputElement>(selector)
          ?? null;
        if (!widgetInput?.value || widgetInput === hiddenInput) return;
        hiddenInput.value = widgetInput.value;
      };

      const announceState = (state: string) => {
        if (!liveRegion || !widget) return;
        try {
          if (typeof widget.getConfiguration === 'function') {
            const config = widget.getConfiguration() as Configuration & { strings?: Record<string, string> };
            liveRegion.textContent = (config.strings ?? {})[state] ?? '';
            return;
          }
        } catch { /* widget not yet ready */ }
        liveRegion.textContent = '';
      };

      const bindWidget = () => {
        if (!widget) return;
        widget.addEventListener('statechange', (ev: Event) => {
          const detail = (ev as CustomEvent<StateChangeDetail>).detail;
          if (!detail) return;
          syncHiddenInputFromWidget();
          announceState(detail.state);
          setPayload(detail.state === 'verified' && detail.payload ? detail.payload : '');
        }, { signal });

        widget.addEventListener('verified', (ev: Event) => {
          const target = ev.target;
          if (!(target instanceof HTMLElement)) return;
          const checkbox = target.querySelector<HTMLInputElement>('input[type="checkbox"]');
          if (checkbox) checkbox.disabled = true;
          syncHiddenInputFromWidget();
        }, { signal });
      };

      const initWidget = async () => {
        try {
          await import('altcha');
          await loadI18n();
        } catch (err) {
          console.warn(`[FormLayer] AltchaField "${name}" failed to load altcha:`, err);
          return;
        }
        if (signal.aborted) return;

        if (widget) {
          bindWidget();
          return;
        }

        const challenge = resolveChallenge({ wrapper, hiddenInput, widget });
        if (challenge === null || !isValidChallenge(challenge)) {
          console.warn(
            `[FormLayer] AltchaField "${name}" has no challenge URL or JSON — `
            + 'ensure the TYPO3 partial renders `<altcha-widget challenge="...">` inside the '
            + '`[data-form-field]` wrapper, or set `data-altcha-challenge` on the wrapper/hidden input.',
          );
          return;
        }

        const created = document.createElement('altcha-widget') as AltchaWidget;
        created.setAttribute('challenge', typeof challenge === 'string' ? challenge : JSON.stringify(challenge));
        created.setAttribute('auto', 'onfocus');
        created.setAttribute('hidelogo', 'true');
        created.setAttribute('hidefooter', 'true');
        created.setAttribute('name', `_altcha_internal_${name}`);
        const lang = detectLanguage();
        if (lang) created.setAttribute('language', lang);
        widget = created;

        liveRegion = document.createElement('span');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'visually-hidden';

        container = document.createElement('div');
        container.className = 'altcha-container';
        container.append(created, liveRegion);
        hiddenInput.insertAdjacentElement('afterend', container);
        bindWidget();
      };

      void initWidget();

      return {
        read: () => hiddenInput.value,
        write: (value) => { hiddenInput.value = String(value); },
        focus: () => (widget?.querySelector<HTMLElement>('input, button') ?? hiddenInput).focus(),
        destroy: () => {
          container?.remove();
          if (hidden.created) hiddenInput.remove();
          widget = null;
          liveRegion = null;
          container = null;
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Find a pre-rendered `<altcha-widget>` inside the wrapper or in the same form
 * (TYPO3 often uses a full `tx_form_formframework[...][identifier]` name).
 */
export function findAltchaWidget(wrapper: HTMLElement, name: string): AltchaWidget | null {
  const inWrapper = wrapper.querySelector('altcha-widget');
  if (inWrapper) return inWrapper as AltchaWidget;

  const form = wrapper.closest('form');
  if (!form) return null;

  const widgets = [...form.querySelectorAll('altcha-widget')];
  if (widgets.length === 0) return null;

  const match = widgets.find((widget) => widgetMatchesField(widget, name));
  if (match) return match as AltchaWidget;

  return widgets.length === 1 ? (widgets[0] as AltchaWidget) : null;
}

/** Match TYPO3 field names like `tx_form_formframework[form-1][altcha-1]`. */
function widgetMatchesField(widget: Element, name: string): boolean {
  const widgetName = widget.getAttribute('name');
  if (!widgetName) return false;
  if (widgetName === name) return true;
  if (widgetName.endsWith(`[${name}]`)) return true;
  const bracketed = widgetName.match(/\[([^\]]+)\]$/);
  return bracketed?.[1] === name;
}

function resolveHiddenInput(wrapper: HTMLElement, name: string): { input: HTMLInputElement; created: boolean } {
  const byName = wrapper.querySelector<HTMLInputElement>(`input[type="hidden"][name="${CSS.escape(name)}"]`);
  if (byName) return { input: byName, created: false };

  // TYPO3: tx_form_formframework[form-1][field-id]
  const byBracketedName = wrapper.querySelector<HTMLInputElement>(`input[type="hidden"][name$="[${CSS.escape(name)}]"]`);
  if (byBracketedName) return { input: byBracketedName, created: false };

  const anyHidden = [...wrapper.querySelectorAll<HTMLInputElement>('input[type="hidden"]')]
    .find((input) => input.name !== '__altcha_nojs');
  if (anyHidden) return { input: anyHidden, created: false };

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = '';
  wrapper.appendChild(input);
  return { input, created: true };
}

function isValidChallenge(challenge: string | object | null): boolean {
  if (!challenge) return false;
  if (typeof challenge === 'object') return true;
  if (challenge.startsWith('{')) return true;
  return challenge.startsWith('http') || challenge.startsWith('/');
}

function detectLanguage(): string | null {
  const htmlLang = document.documentElement.lang;
  return htmlLang ? htmlLang.split('-')[0].toLowerCase() : null;
}

async function loadI18n(): Promise<void> {
  const lang = detectLanguage();
  if (!lang || lang === 'en') return;
  try {
    await import(`altcha/i18n/${lang}`);
  } catch {
    /* translation not available — widget falls back to English */
  }
}

