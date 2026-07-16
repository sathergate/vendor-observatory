import type {
  CollectionsConfig,
  CollectionSchema,
  Collection,
  ContentEntry,
  QueryOptions,
  Pressroom,
} from "./types.js";
import { createCollection } from "./collection.js";

/**
 * Create a Pressroom instance from a collections config.
 *
 * ```ts
 * const pr = createPressroom({
 *   posts: { schema: { title: "string", date: "date" }, directory: "./content/posts" },
 *   authors: { schema: { name: "string" }, directory: "./content/authors", format: "json" },
 * });
 * ```
 */
export function createPressroom(config: CollectionsConfig): Pressroom {
  const collectionMap = new Map<string, Collection<CollectionSchema>>();

  for (const [name, collectionConfig] of Object.entries(config)) {
    collectionMap.set(name, createCollection(name, collectionConfig));
  }

  function collection<S extends CollectionSchema = CollectionSchema>(name: string): Collection<S> {
    const col = collectionMap.get(name);
    if (!col) {
      throw new Error(
        `[pressroom] Collection "${name}" not found. Available: ${[...collectionMap.keys()].join(", ")}`,
      );
    }
    return col as unknown as Collection<S>;
  }

  async function getEntry<S extends CollectionSchema = CollectionSchema>(
    collectionName: string,
    slug: string,
  ): Promise<ContentEntry<S> | null> {
    return collection<S>(collectionName).getBySlug(slug);
  }

  async function getEntries<S extends CollectionSchema = CollectionSchema>(
    collectionName: string,
    options?: QueryOptions,
  ): Promise<ContentEntry<S>[]> {
    return collection<S>(collectionName).getAll(options);
  }

  return {
    collection,
    getEntry,
    getEntries,
    collections: [...collectionMap.keys()],
  };
}
