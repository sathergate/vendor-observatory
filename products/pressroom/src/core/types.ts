/** Supported field types for collection schemas. */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "array"
  | "object"
  | "image"
  | "slug";

/** Full field definition with validation and defaults. */
export interface FieldDefinition {
  type: FieldType;
  required?: boolean;
  default?: unknown;
  validate?: (value: unknown) => boolean | string;
}

/**
 * Collection schema: each key maps to either a full FieldDefinition
 * or a shorthand FieldType string.
 */
export type CollectionSchema = Record<string, FieldDefinition | FieldType>;

/** Supported content file formats. */
export type ContentFormat = "mdx" | "md" | "json" | "yaml";

/** Configuration for a single content collection. */
export interface CollectionConfig {
  schema: CollectionSchema;
  /** Path to the directory containing content files. */
  directory: string;
  /** File format. Defaults to "md". */
  format?: ContentFormat;
  /** Which frontmatter field to use as slug. Defaults to filename. */
  slugField?: string;
}

/** Top-level config: a map of collection names to their configs. */
export type CollectionsConfig = Record<string, CollectionConfig>;

/** A single content entry returned from a collection query. */
export interface ContentEntry<S extends CollectionSchema = CollectionSchema> {
  slug: string;
  data: InferSchema<S>;
  /** Raw markdown/MDX body (undefined for JSON/YAML files). */
  content?: string;
  filePath: string;
}

/** Filter operator for where clauses. */
export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";

/** A single filter predicate. */
export interface FilterPredicate {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/** Options for querying a collection. */
export interface QueryOptions {
  where?: FilterPredicate[];
  sort?: { field: string; order: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

/** Fluent query builder interface. */
export interface QueryBuilder<S extends CollectionSchema = CollectionSchema> {
  where(field: string, operator: FilterOperator, value: unknown): QueryBuilder<S>;
  sort(field: string, order?: "asc" | "desc"): QueryBuilder<S>;
  limit(n: number): QueryBuilder<S>;
  offset(n: number): QueryBuilder<S>;
  exec(): Promise<ContentEntry<S>[]>;
}

/** A collection instance with query methods. */
export interface Collection<S extends CollectionSchema = CollectionSchema> {
  name: string;
  config: CollectionConfig;
  getAll(options?: QueryOptions): Promise<ContentEntry<S>[]>;
  getBySlug(slug: string): Promise<ContentEntry<S> | null>;
  query(): QueryBuilder<S>;
}

/** The main Pressroom instance. */
export interface Pressroom {
  collection<S extends CollectionSchema = CollectionSchema>(name: string): Collection<S>;
  getEntry<S extends CollectionSchema = CollectionSchema>(
    collectionName: string,
    slug: string,
  ): Promise<ContentEntry<S> | null>;
  getEntries<S extends CollectionSchema = CollectionSchema>(
    collectionName: string,
    options?: QueryOptions,
  ): Promise<ContentEntry<S>[]>;
  collections: string[];
}

// ---------------------------------------------------------------------------
// Schema inference helpers
// ---------------------------------------------------------------------------

type FieldTypeToTS<T extends FieldType> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : T extends "date"
        ? Date
        : T extends "array"
          ? unknown[]
          : T extends "object"
            ? Record<string, unknown>
            : T extends "image"
              ? string
              : T extends "slug"
                ? string
                : unknown;

type InferField<F> = F extends FieldDefinition
  ? FieldTypeToTS<F["type"]>
  : F extends FieldType
    ? FieldTypeToTS<F>
    : unknown;

/** Infer the TypeScript type of parsed data from a CollectionSchema. */
export type InferSchema<S extends CollectionSchema> = {
  [K in keyof S]: InferField<S[K]>;
};
