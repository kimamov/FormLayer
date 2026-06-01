import type { FormFieldFactory } from './types';
import type { CustomFieldsMap } from './create-field';

const registry = new Map<string, FormFieldFactory>();

/** Register a custom field type globally (`data-field-type` → factory). */
export function registerFieldType(type: string, factory: FormFieldFactory): void {
  registry.set(type, factory);
}

export function unregisterFieldType(type: string): boolean {
  return registry.delete(type);
}

export function hasFieldType(type: string): boolean {
  return registry.has(type);
}

export function getRegisteredFieldTypes(): CustomFieldsMap {
  return Object.fromEntries(registry);
}

/** Global registrations first; per-form `fieldsMap` entries override. */
export function mergeFieldsMap(local?: CustomFieldsMap): CustomFieldsMap {
  return { ...getRegisteredFieldTypes(), ...(local ?? {}) };
}
