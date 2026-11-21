import { defineField } from 'formlayer';

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
const DatePickerField = defineField({
  setup(ctx) {
    const textInput = ctx.control<HTMLInputElement>();
    let picker: AirDatepicker | null = null;

    const resolvePhpFormat = (): string =>
      ctx.wrapper.querySelector<HTMLInputElement>('input[type="hidden"][name$="[dateFormat]"]')?.value ?? 'Y-m-d';

    const syncPicker = (value: string) => {
      if (!picker) return;
      const parsed = value ? parseByFormat(value, resolvePhpFormat()) : undefined;
      picker.selectDate(parsed ?? [], { silent: true });
    };

    textInput.addEventListener('blur', () => ctx.touch(), { signal: ctx.signal });
    textInput.addEventListener('input', () => ctx.input(), { signal: ctx.signal });

    const initPicker = async () => {
      if (ctx.signal.aborted) return;
      const phpFormat = resolvePhpFormat();

      try {
        const { default: AirDatepicker } = await import('air-datepicker');
        await import('air-datepicker/air-datepicker.css');
        const enModule = await import('air-datepicker/locale/en');
        const mod = enModule as { default?: Record<string, unknown> };
        const locale = mod.default && 'days' in mod.default ? mod.default : mod.default ?? enModule;
        if (ctx.signal.aborted) return;

        const initial = textInput.value ? parseByFormat(textInput.value, phpFormat) : undefined;

        picker = new AirDatepicker(textInput, {
          dateFormat: phpFormatToAir(phpFormat),
          autoClose: true,
          isMobile: window.matchMedia('(pointer: coarse)').matches,
          selectedDates: initial ? [initial] : undefined,
          buttons: ['today', 'clear'],
          locale: locale as Partial<AirDatepickerLocale>,
          onSelect: ({ date }) => {
            const d = Array.isArray(date) ? date[0] : date;
            if (!d) textInput.value = '';
            ctx.commit();
          },
        });
      } catch (err) {
        console.warn(`[FormLayer] DatePickerField "${ctx.name}" failed to load air-datepicker:`, err);
      }
    };

    void initPicker();

    return {
      read: () => textInput.value,
      write: (value) => {
        textInput.value = String(value);
        syncPicker(textInput.value);
      },
      reset: () => {
        textInput.value = textInput.defaultValue;
        syncPicker(textInput.value);
      },
      destroy: () => {
        picker?.destroy();
        picker = null;
      },
    };
  },
});

export default DatePickerField;

function parseByFormat(value: string, phpFormat: string): Date | undefined {
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

type AirDatepicker = import('air-datepicker').default;
type AirDatepickerLocale = import('air-datepicker').AirDatepickerLocale;
