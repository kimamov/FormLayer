/**
 * Field values.
 *
 * - `string` for text inputs, textareas, single selects, radio groups and single checkboxes
 * - `string[]` for checkbox groups and multi-selects
 * - `File[]` for file inputs
 */
export type FieldValue = string | string[] | File[];

const hasFile = typeof File !== 'undefined';

export function isFileValue(value: FieldValue): value is File[] {
  return Array.isArray(value) && hasFile && value.some((v) => v instanceof File);
}

/** Selected values as a list: `''` → `[]`, `'a'` → `['a']`, arrays as they are. */
export function valueToList(value: FieldValue): Array<string | File> {
  if (Array.isArray(value)) return value;
  return value === '' ? [] : [value];
}

/**
 * A single string for code that needs one: lists are joined with commas, files
 * become their names. Used for string validators, conditions and server-error
 * bookkeeping.
 */
export function valueToString(value: FieldValue): string {
  if (!Array.isArray(value)) return value;
  return value.map((v) => (typeof v === 'string' ? v : v.name)).join(',');
}

export function isEmptyValue(value: FieldValue): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim() === '';
}

/** Stable key to compare two values (files by name, size and modification time). */
export function valueKey(value: FieldValue): string {
  if (!Array.isArray(value)) return `s:${value}`;
  return `a:${JSON.stringify(value.map((v) => (typeof v === 'string' ? v : [v.name, v.size, v.lastModified])))}`;
}
