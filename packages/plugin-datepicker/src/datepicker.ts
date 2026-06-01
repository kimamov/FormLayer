import { AbstractDomFormField, SELECTORS } from 'formlayer';

const PHP_TO_AIR: Record<string, string> = {
  Y: 'yyyy', y: 'yy',
  m: 'MM',   n: 'M',
  d: 'dd',   j: 'd',
};

function phpFormatToAir(php: string): string {
  let out = '';
  for (let i = 0; i < php.length; i++) {
    const ch = php[i];
    if (ch === '\\' && i + 1 < php.length) {
      out += php[++i];
    } else {
      out += PHP_TO_AIR[ch] ?? ch;
    }
  }
  return out;
}

/**
 * Wraps a text input with Air Datepicker. If the library fails to load,
 * the plain text input remains fully functional.
 */
export default class DatePickerField extends AbstractDomFormField {
  private textInput!: HTMLInputElement;
  private picker: AirDatepicker | null = null;

  protected mount(): void {
    const input = this.wrapper.querySelector<HTMLInputElement>(SELECTORS.input);
    if (!input) {
      throw new Error(`[FormsModule] DatePickerField "${this.name}" requires a text input`);
    }
    this.textInput = input;
    this.setControlElement(input);

    this.textInput.addEventListener('blur', () => {
      this.markTouched();
      this.validate();
      this.notifyChange();
    }, { signal: this.signal });

    this.textInput.addEventListener('input', () => {
      this.markDirty();
    }, { signal: this.signal });

    void this.initPicker();
  }

  protected readValue(): string {
    return this.textInput.value;
  }

  protected writeValue(value: string): void {
    this.textInput.value = value;
    if (this.picker) {
      const phpFormat = this.resolvePhpFormat();
      const parsed = value ? this.parseByFormat(value, phpFormat) : undefined;
      this.picker.selectDate(parsed ?? [], { silent: true });
    }
  }

  protected onReset(): void {
    this.textInput.value = this.textInput.defaultValue;
    if (this.picker) {
      const parsed = this.textInput.value
        ? this.parseByFormat(this.textInput.value, this.resolvePhpFormat())
        : undefined;
      this.picker.selectDate(parsed ?? [], { silent: true });
    }
  }

  protected onDestroy(): void {
    this.picker?.destroy();
    this.picker = null;
  }

  private async initPicker(): Promise<void> {
    const phpFormat = this.resolvePhpFormat();
    const airFormat = phpFormatToAir(phpFormat);

    try {
      const { default: AirDatepicker } = await import('air-datepicker');
      await import('air-datepicker/air-datepicker.css');
      const enModule = await import('air-datepicker/locale/en');
      const mod = enModule as { default?: Record<string, unknown> };
      const locale = mod.default && 'days' in mod.default ? mod.default : mod.default ?? enModule;

      const initial = this.textInput.value
        ? this.parseByFormat(this.textInput.value, phpFormat)
        : undefined;

      this.picker = new AirDatepicker(this.textInput, {
        dateFormat: airFormat,
        autoClose: true,
        isMobile: window.matchMedia('(pointer: coarse)').matches,
        selectedDates: initial ? [initial] : undefined,
        buttons: ['today', 'clear'],
        locale: locale as Partial<AirDatepickerLocale>,
        onSelect: ({ date }) => {
          const d = Array.isArray(date) ? date[0] : date;
          if (!d) {
            this.textInput.value = '';
          }
          this.markDirty();
          this.markTouched();
          this.setValue(this.textInput.value);
        },
      });
    } catch (err) {
      console.warn(`[FormsModule] DatePickerField "${this.name}" failed to load air-datepicker:`, err);
    }
  }

  private resolvePhpFormat(): string {
    return this.wrapper
      .querySelector<HTMLInputElement>('input[type="hidden"][name$="[dateFormat]"]')
      ?.value ?? 'Y-m-d';
  }

  private parseByFormat(value: string, phpFormat: string): Date | undefined {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = new Date(value + 'T00:00:00');
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    const tokens = phpFormat.match(/[YymndjFM]/g) ?? [];
    const parts = value.split(/[\s./-]+/);
    let year = 2000, month = 0, day = 1;

    tokens.forEach((t, i) => {
      const n = parseInt(parts[i], 10);
      if (Number.isNaN(n)) return;
      switch (t) {
        case 'Y': year = n; break;
        case 'y': year = n < 50 ? 2000 + n : 1900 + n; break;
        case 'm': case 'n': month = n - 1; break;
        case 'd': case 'j': day = n; break;
      }
    });

    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
}

type AirDatepicker = import('air-datepicker').default;
type AirDatepickerLocale = import('air-datepicker').AirDatepickerLocale;
