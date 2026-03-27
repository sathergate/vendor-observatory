import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import type {
  CollectionConfig,
  CollectionSchema,
  ContentEntry,
  QueryOptions,
  QueryBuilder,
  Collection,
  FilterPredicate,
  FilterOperator,
} from "./types.js";
import { parseFrontmatter, parseJSON, parseYaml } from "./parser.js";
import { validateEntry } from "./validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMAT_EXTENSIONS: Record<string, string[]> = {
  md: [".md"],
  mdx: [".mdx"],
  json: [".json"],
  yaml: [".yaml", ".yml"],
};

function matchesFormat(filename: string, format: string): boolean {
  const ext = extname(filename).toLowerCase();
  return (FORMAT_EXTENSIONS[format] ?? [`.${format}`]).includes(ext);
}

function slugFromFilename(filename: string): string {
  return basename(filename, extname(filename));
}

function applyFilter(value: unknown, operator: FilterOperator, target: unknown): boolean {
  switch (operator) {
    case "eq":
      return value === target;
    case "neq":
      return value !== target;
    case "gt":
      return (value as number) > (target as number);
    case "gte":
      return (value as number) >= (target as number);
    case "lt":
      return (value as number) < (target as number);
    case "lte":
      return (value as number) <= (target as number);
    case "in":
      return Array.isArray(target) && target.includes(value);
    case "contains":
      if (typeof value === "string") return value.includes(String(target));
      if (Array.isArray(value)) return value.includes(target);
      return false;
    default:
      return true;
  }
}

function applyQueryOptions<S extends CollectionSchema>(
  entries: ContentEntry<S>[],
  options?: QueryOptions,
): ContentEntry<S>[] {
  if (!options) return entries;
  let result = [...entries];

  // Filter
  if (options.where) {
    for (const predicate of options.where) {
      result = result.filter((entry) => {
        const value = (entry.data as Record<string, unknown>)[predicate.field];
        return applyFilter(value, predicate.operator, predicate.value);
      });
    }
  }

  // Sort
  if (options.sort) {
    const { field, order } = options.sort;
    result.sort((a, b) => {
      const aVal = (a.data as Record<string, unknown>)[field];
      const bVal = (b.data as Record<string, unknown>)[field];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      const cmp = aVal < bVal ? -1 : 1;
      return order === "desc" ? -cmp : cmp;
    });
  }

  // Offset
  if (options.offset) {
    result = result.slice(options.offset);
  }

  // Limit
  if (options.limit !== undefined) {
    result = result.slice(0, options.limit);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Collection implementation
// ---------------------------------------------------------------------------

async function readEntry<S extends CollectionSchema>(
  filePath: string,
  config: CollectionConfig,
): Promise<ContentEntry<S> | null> {
  const raw = await readFile(filePath, "utf-8");
  const format = config.format ?? "md";
  let data: Record<string, unknown>;
  let content: string | undefined;

  if (format === "json") {
    data = parseJSON(raw);
  } else if (format === "yaml") {
    data = parseYaml(raw);
  } else {
    // md / mdx
    const parsed = parseFrontmatter(raw);
    data = parsed.data;
    content = parsed.content;
  }

  const validation = validateEntry(data, config.schema);
  if (!validation.valid) {
    console.warn(
      `[pressroom] Validation errors in ${filePath}:\n  ${validation.errors.join("\n  ")}`,
    );
  }

  const slug = config.slugField
    ? String(data[config.slugField] ?? slugFromFilename(basename(filePath)))
    : slugFromFilename(basename(filePath));

  return {
    slug,
    data: data as ContentEntry<S>["data"],
    content,
    filePath,
  };
}

export function createCollection<S extends CollectionSchema = CollectionSchema>(
  name: string,
  config: CollectionConfig,
): Collection<S> {
  let cache: ContentEntry<S>[] | null = null;

  async function loadAll(): Promise<ContentEntry<S>[]> {
    if (cache) return cache;

    const format = config.format ?? "md";
    let files: string[];
    try {
      const dirEntries = await readdir(config.directory);
      files = dirEntries.filter((f) => matchesFormat(f, format));
    } catch {
      console.warn(`[pressroom] Directory not found: ${config.directory}`);
      return [];
    }

    const entries: ContentEntry<S>[] = [];
    for (const file of files) {
      const entry = await readEntry<S>(join(config.directory, file), config);
      if (entry) entries.push(entry);
    }

    cache = entries;
    return entries;
  }

  async function getAll(options?: QueryOptions): Promise<ContentEntry<S>[]> {
    const all = await loadAll();
    return applyQueryOptions(all, options);
  }

  async function getBySlug(slug: string): Promise<ContentEntry<S> | null> {
    const all = await loadAll();
    return all.find((e) => e.slug === slug) ?? null;
  }

  function query(): QueryBuilder<S> {
    const predicates: FilterPredicate[] = [];
    let sortOpt: { field: string; order: "asc" | "desc" } | undefined;
    let limitVal: number | undefined;
    let offsetVal: number | undefined;

    const builder: QueryBuilder<S> = {
      where(field: string, operator: FilterOperator, value: unknown) {
        predicates.push({ field, operator, value });
        return builder;
      },
      sort(field: string, order: "asc" | "desc" = "asc") {
        sortOpt = { field, order };
        return builder;
      },
      limit(n: number) {
        limitVal = n;
        return builder;
      },
      offset(n: number) {
        offsetVal = n;
        return builder;
      },
      async exec() {
        return getAll({
          where: predicates.length > 0 ? predicates : undefined,
          sort: sortOpt,
          limit: limitVal,
          offset: offsetVal,
        });
      },
    };

    return builder;
  }

  return { name, config, getAll, getBySlug, query };
}
