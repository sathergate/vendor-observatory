import type { Pressroom, CollectionSchema, ContentEntry, QueryOptions } from "./core/types.js";

/**
 * Generate static params for Next.js dynamic routes.
 *
 * Use in a `[slug]/page.tsx`:
 * ```ts
 * export const generateStaticParams = () => generateStaticParamsForCollection(pressroom, "posts");
 * ```
 */
export async function generateStaticParams(
  pressroom: Pressroom,
  collectionName: string,
): Promise<Array<{ slug: string }>> {
  const entries = await pressroom.getEntries(collectionName);
  return entries.map((entry) => ({ slug: entry.slug }));
}

/**
 * Helper for fetching a single content entry in a Server Component.
 *
 * ```ts
 * const post = await getStaticContent(pressroom, "posts", params.slug);
 * ```
 */
export async function getStaticContent<S extends CollectionSchema = CollectionSchema>(
  pressroom: Pressroom,
  collectionName: string,
  slug: string,
): Promise<ContentEntry<S> | null> {
  return pressroom.getEntry<S>(collectionName, slug);
}

/**
 * Create a Next.js Route Handler for querying content via API.
 *
 * ```ts
 * // app/api/content/[collection]/route.ts
 * import { createContentHandler } from "pressroom/next";
 * const handler = createContentHandler(pressroom);
 * export const GET = handler;
 * ```
 *
 * Query params:
 * - `slug` — fetch single entry
 * - `sort` — field to sort by
 * - `order` — "asc" | "desc"
 * - `limit` — max entries
 * - `offset` — skip entries
 * - `where.{field}.{op}` — filter (e.g. `where.published.eq=true`)
 */
export function createContentHandler(pressroom: Pressroom) {
  return async function handler(
    request: Request,
    context: { params: Promise<{ collection: string }> | { collection: string } },
  ): Promise<Response> {
    try {
      const resolvedParams = await Promise.resolve(context.params);
      const collectionName = resolvedParams.collection;

      // Verify collection exists
      if (!pressroom.collections.includes(collectionName)) {
        return new Response(
          JSON.stringify({ error: `Collection "${collectionName}" not found.` }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");

      // Single entry
      if (slug) {
        const entry = await pressroom.getEntry(collectionName, slug);
        if (!entry) {
          return new Response(
            JSON.stringify({ error: `Entry "${slug}" not found.` }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(entry), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Build query options from search params
      const options: QueryOptions = {};

      const sortField = url.searchParams.get("sort");
      if (sortField) {
        const order = (url.searchParams.get("order") as "asc" | "desc") ?? "asc";
        options.sort = { field: sortField, order };
      }

      const limit = url.searchParams.get("limit");
      if (limit) options.limit = parseInt(limit, 10);

      const offset = url.searchParams.get("offset");
      if (offset) options.offset = parseInt(offset, 10);

      // Parse where params: where.field.op=value
      const wherePredicates: QueryOptions["where"] = [];
      for (const [key, value] of url.searchParams.entries()) {
        if (key.startsWith("where.")) {
          const parts = key.split(".");
          if (parts.length === 3) {
            wherePredicates.push({
              field: parts[1],
              operator: parts[2] as QueryOptions["where"] extends Array<infer T>
                ? T extends { operator: infer O }
                  ? O
                  : never
                : never,
              value: parseQueryValue(value),
            });
          }
        }
      }
      if (wherePredicates.length > 0) {
        options.where = wherePredicates;
      }

      const entries = await pressroom.getEntries(collectionName, options);
      return new Response(JSON.stringify(entries), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

function parseQueryValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const n = Number(value);
  if (!isNaN(n) && value.trim() !== "") return n;
  return value;
}
