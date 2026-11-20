import type { FieldValue, Validator, ValidatorResult } from '../types';
import { isFileValue } from '../field-value';

function matches(type: string, allowed: string): boolean {
  const pattern = allowed.trim().toLowerCase();
  if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
  return type === pattern;
}

/**
 * TYPO3 `MimeType`: every selected file must have one of `allowedMimeTypes`
 * (exact types or wildcards like `image/*`). Reads files from `options.__files`;
 * an empty file input is valid (combine with `NotEmpty` to require a file).
 * The browser-reported type is a hint only: the server must check the content.
 */
export const mimeType: Validator = {
  type: 'MimeType',
  validate(value: FieldValue, options: Record<string, unknown>): ValidatorResult {
    const files = isFileValue(value) ? value : (options['__files'] as ArrayLike<File> | undefined);
    if (!files || files.length === 0) {
      return { valid: true, message: '' };
    }

    const raw = options['allowedMimeTypes'];
    const allowed = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
      .map(String)
      .filter((t) => t.trim() !== '');
    if (allowed.length === 0) {
      return { valid: true, message: '' };
    }

    const customMsg = options.message as string | undefined;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = (file.type || '').toLowerCase();
      if (!allowed.some((a) => matches(type, a))) {
        return {
          valid: false,
          message: customMsg ?? `File "${file.name}" has a type that is not allowed.`,
        };
      }
    }
    return { valid: true, message: '' };
  },
};
