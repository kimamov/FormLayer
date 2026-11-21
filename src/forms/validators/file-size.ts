import { defineValidator, invalid, VALID } from '../validation';
import { isFileValue } from '../field-value';

const SIZE_UNITS: Record<string, number> = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };

function parseSize(input: string): number {
  const match = input.trim().toUpperCase().match(/^(\d+(?:\.\d+)?)\s*([BKMG])?$/);
  if (!match) return 0;
  return parseFloat(match[1]) * (SIZE_UNITS[match[2] ?? 'B'] ?? 1);
}

/** TYPO3 `FileSize`: every selected file must be within `minimum`/`maximum` (e.g. `"5M"`). */
export const fileSize = defineValidator({
  type: 'FileSize',
  options: { minimum: String, maximum: String },
  validate(value, { minimum = '0B', maximum }, ctx) {
    const files = isFileValue(value) ? value : ctx.files;
    if (files.length === 0) return VALID;
    const min = parseSize(minimum);
    const max = maximum ? parseSize(maximum) : Infinity;
    for (const file of files) {
      if (file.size < min) {
        return invalid('FileSize.tooSmall', `File "${file.name}" is too small. Minimum: ${minimum}.`, { fileName: file.name, minimum, maximum });
      }
      if (file.size > max) {
        return invalid('FileSize.tooLarge', `File "${file.name}" is too large. Maximum: ${maximum}.`, { fileName: file.name, minimum, maximum });
      }
    }
    return VALID;
  },
});
