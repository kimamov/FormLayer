import { defineValidator, invalid, VALID } from '../validation';
import { isFileValue } from '../field-value';

function matches(type: string, allowed: string): boolean {
  const pattern = allowed.trim().toLowerCase();
  if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
  return type === pattern;
}

/**
 * TYPO3 `MimeType`: every selected file must have one of `allowedMimeTypes`
 * (exact types or wildcards like `image/*`). An empty file input is valid
 * (combine with `NotEmpty` to require a file). The browser-reported type is a
 * hint only: the server must check the content.
 */
export const mimeType = defineValidator({
  type: 'MimeType',
  options: { allowedMimeTypes: Array },
  validate(value, { allowedMimeTypes = [] }, ctx) {
    const files = isFileValue(value) ? value : ctx.files;
    if (files.length === 0 || allowedMimeTypes.length === 0) return VALID;
    for (const file of files) {
      const type = (file.type || '').toLowerCase();
      if (!allowedMimeTypes.some((a) => matches(type, a))) {
        return invalid('MimeType', `File "${file.name}" has a type that is not allowed.`, { fileName: file.name, allowedMimeTypes: allowedMimeTypes.join(', ') });
      }
    }
    return VALID;
  },
});
