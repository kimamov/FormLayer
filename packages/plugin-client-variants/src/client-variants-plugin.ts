import type { FormPlugin, FormPluginHost, ClientVariant } from 'formlayer';
import { evaluateExpression } from './expression-parser';

interface VariantConfig {
  /** The element carrying `data-client-variants`: a field wrapper or any container. */
  element: HTMLElement;
  /** Set when the element is itself a field wrapper. */
  fieldName: string | null;
  variants: ClientVariant[];
}

const DISABLED_FIELDS_INPUT_NAME = '__clientVariantsDisabled';
const EVALUATED_ATTR = 'data-fl-evaluated';

/**
 * Shows and hides fields based on other fields' values.
 *
 * `data-client-variants` works on a field wrapper (`[data-form-field]`) or on
 * any container inside the form (a fieldset, a section): a hidden container
 * hides and disables every field inside it.
 *
 *   <div data-form-field="germanTax"
 *        data-client-variants='[{"condition": "formValue(\"country\") === \"germany\"", "enabled": true}]'>
 *
 * An element is shown when one of its variants with `enabled: true` matches;
 * otherwise it is hidden. Hidden and disabled fields:
 * - are skipped by validation and left out of the submitted data;
 * - count as empty (`''`) in other conditions, so chains of conditions settle;
 * - are listed in a hidden `__clientVariantsDisabled` input for the backend.
 *
 * Conditions are evaluated synchronously during `init()` when the plugin is
 * registered as a class, so conditional fields never flash visible on load.
 * Evaluated elements get `data-fl-evaluated`, for a CSS fallback in lazy setups:
 *
 *   [data-client-variants]:not([data-fl-evaluated]) { visibility: hidden; }
 */
export default class ClientVariantsPlugin implements FormPlugin {
  private host!: FormPluginHost;
  private formEl!: HTMLFormElement;
  private configs: VariantConfig[] = [];
  private disabledInput!: HTMLInputElement;
  private disabled = new Set<string>();
  private unsubscribe: Array<() => void> = [];
  /** True while this plugin toggles fields (their change events are ignored). */

  init(formEl: HTMLFormElement, host: FormPluginHost): void {
    this.host = host;
    this.formEl = formEl;
    this.configs = this.parseConfigs();
    this.disabledInput = this.createDisabledFieldsInput();

    this.unsubscribe.push(
      // Toggling fields re-emits field:change for them; only the user's changes matter.
      host.on('field:change', () => {
        if (!this.applying) this.evaluate();
      }),
      host.on('field:added', () => {
        this.configs = this.parseConfigs();
        this.evaluate();
      }),
    );

    this.evaluate();
  }

  destroy(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.disabledInput?.remove();
  }

  private applying = false;

  private parseConfigs(): VariantConfig[] {
    const configs: VariantConfig[] = [];
    for (const element of Array.from(this.formEl.querySelectorAll<HTMLElement>('[data-client-variants]'))) {
      const raw = element.getAttribute('data-client-variants');
      if (!raw) continue;
      try {
        const variants = JSON.parse(raw) as ClientVariant[];
        if (Array.isArray(variants) && variants.length > 0) {
          configs.push({ element, fieldName: element.getAttribute('data-form-field'), variants });
        }
      } catch {
        const label = element.getAttribute('data-form-field') ?? element.id ?? element.tagName.toLowerCase();
        console.warn(`[FormLayer] Invalid data-client-variants JSON on "${label}"`);
      }
    }
    return configs;
  }

  private createDisabledFieldsInput(): HTMLInputElement {
    let input = this.formEl.querySelector<HTMLInputElement>(`input[name="${DISABLED_FIELDS_INPUT_NAME}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = DISABLED_FIELDS_INPUT_NAME;
      this.formEl.appendChild(input);
    }
    return input;
  }

  /** Field names governed by a config: the field itself, or every field inside the container. */
  private fieldsOf(config: VariantConfig): string[] {
    return config.fieldName ? [config.fieldName] : this.host.getFieldsIn(config.element);
  }

  /**
   * Evaluate all conditions until the set of disabled fields stops changing,
   * with hidden fields reading as empty. Chains of any length settle; a cycle
   * is cut off after as many rounds as there are conditions.
   */
  private evaluate(): void {
    let disabled = new Set<string>();
    let shown = new Map<VariantConfig, boolean>();
    const maxRounds = this.configs.length + 1;

    for (let round = 0; round <= maxRounds; round++) {
      const resolver = (name: string) => (disabled.has(name) ? '' : this.host.getFieldValue(name) ?? '');
      const nextDisabled = new Set<string>();
      const nextShown = new Map<VariantConfig, boolean>();

      for (const config of this.configs) {
        const visible = this.matches(config.variants, resolver);
        nextShown.set(config, visible);
        if (!visible) this.fieldsOf(config).forEach((name) => nextDisabled.add(name));
      }

      const settled = sameSet(disabled, nextDisabled);
      disabled = nextDisabled;
      shown = nextShown;
      if (settled) break;
      if (round === maxRounds) {
        console.warn('[FormLayer] data-client-variants conditions did not settle (circular conditions?); using the last result.');
      }
    }

    this.apply(disabled, shown);
  }

  private apply(disabled: Set<string>, shown: Map<VariantConfig, boolean>): void {
    this.applying = true;
    try {
      const governed = new Set<string>();
      for (const config of this.configs) this.fieldsOf(config).forEach((name) => governed.add(name));
      for (const name of governed) this.host.setFieldEnabled(name, !disabled.has(name));

      for (const [config, visible] of shown) {
        if (!config.fieldName) {
          // Containers: hide the group itself; its fields were disabled above.
          config.element.hidden = !visible;
          if (visible) config.element.removeAttribute('aria-hidden');
          else config.element.setAttribute('aria-hidden', 'true');
        }
        config.element.setAttribute(EVALUATED_ATTR, '');
      }

      this.disabled = disabled;
      this.disabledInput.value = [...disabled].join(',');
    } finally {
      this.applying = false;
    }
  }

  private matches(variants: ClientVariant[], resolver: (name: string) => string): boolean {
    for (const variant of variants) {
      try {
        if (variant.enabled === true && evaluateExpression(variant.condition, resolver)) return true;
      } catch (err) {
        console.warn('[FormLayer] Error evaluating variant condition:', err);
      }
    }
    return false;
  }

  /** Fields this plugin currently disables. */
  get disabledFields(): ReadonlySet<string> {
    return this.disabled;
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
