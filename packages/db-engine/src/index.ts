import type { PropertyId } from '@notnote/shared';

export const PROPERTY_TYPES = [
  'title',
  'text',
  'number',
  'select',
  'multi_select',
  'status',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
  'people',
  'files',
  'relation',
  'rollup',
  'formula',
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
  'unique_id',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Types that the initial release renders and stores natively. */
export const SUPPORTED_PROPERTY_TYPES: ReadonlySet<PropertyType> = new Set(PROPERTY_TYPES);

/** Types that are computed from other data and cannot be written directly. */
export const COMPUTED_PROPERTY_TYPES: ReadonlySet<PropertyType> = new Set([
  'rollup',
  'formula',
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
  'unique_id',
]);

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'before',
  'after',
  'within',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface ViewFilter {
  readonly propertyId: PropertyId;
  readonly operator: FilterOperator;
  readonly value?: unknown;
}

export interface ViewSort {
  readonly propertyId: PropertyId;
  readonly direction: 'asc' | 'desc';
}

export interface ViewConfig {
  readonly filters: readonly ViewFilter[];
  readonly sorts: readonly ViewSort[];
  readonly groupBy?: PropertyId;
  readonly search?: string;
}

export interface CompiledQuery {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

export function isComputed(type: PropertyType): boolean {
  return COMPUTED_PROPERTY_TYPES.has(type);
}

export function isSupported(type: PropertyType): boolean {
  return SUPPORTED_PROPERTY_TYPES.has(type);
}

/**
 * Placeholder for the Phase 2 view compiler.
 * Throws instead of returning a query that could silently leak data.
 */
export function compileView(_config: ViewConfig): CompiledQuery {
  throw new Error('view compiler is implemented in Phase 2');
}
