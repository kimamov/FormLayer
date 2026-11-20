import { NativeField } from './native-field';
import type { FieldOptions } from './field-options';

export type { FieldErrorRenderContext } from './field-options';

export type FieldControllerOptions = FieldOptions;

/**
 * @deprecated Renamed to `NativeField`. `FieldController` stays as an alias for
 * one minor version.
 */
export const FieldController = NativeField;
export type FieldController = NativeField;
