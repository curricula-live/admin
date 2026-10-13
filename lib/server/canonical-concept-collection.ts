/** Strict adapter for the public, non-production canonical concept collection.
 * No classification, scholarly evidence or relationships are inferred.
 */
import "server-only";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CanonicalConcept = { id: string; slug: string; label: string };
export type CanonicalConceptPage = {
  concepts: CanonicalConcept[];
  limit: number;
  offset: number;
  hasMore: boolean;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseCanonicalConceptPage(value: unknown): CanonicalConceptPage | null {
  if (!isRecord(value) || value.contract_version !== "knowledge-v2-preview@1" ||
      value.release_verified !== false || !Array.isArray(value.results) ||
      !Number.isInteger(value.limit) || !Number.isInteger(value.offset) ||
      (value.limit as number) < 1 || (value.limit as number) > 100 ||
      (value.offset as number) < 0 || (value.offset as number) > 100000 ||
      typeof value.has_more !== "boolean" || value.results.length > (value.limit as number)) return null;
  const concepts: CanonicalConcept[] = [];
  const ids = new Set<string>();
  for (const item of value.results) {
    if (!isRecord(item) || typeof item.id !== "string" || !UUID.test(item.id) ||
        typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
        typeof item.label !== "string" || !item.label.trim() || item.label.length > 200 ||
        ids.has(item.id)) return null;
    ids.add(item.id);
    concepts.push({ id: item.id, slug: item.slug, label: item.label });
  }
  return { concepts, limit: value.limit as number, offset: value.offset as number, hasMore: value.has_more };
}

export async function readCanonicalConceptPage(limit = 100, offset = 0): Promise<CanonicalConceptPage | null> {
  if (process.env.ATLAS_PUBLIC_DATA_PREVIEW_ENABLED !== "true" ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100000) return null;
  const raw = process.env.CURRICULA_API_ORIGIN;
  if (!raw) return null;
  let origin: URL;
  try {
    origin = new URL(raw);
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return null;
    const remote = origin.origin === "https://api.curricula.live";
    const local = process.env.NODE_ENV !== "production" && origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname) && ["8000", "8080"].includes(origin.port);
    if (!remote && !local) return null;
  } catch { return null; }
  try {
    const url = new URL("/v2-preview/concepts/", origin);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      method: "GET", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const parsed = parseCanonicalConceptPage(await response.json());
    return parsed && parsed.limit === limit && parsed.offset === offset ? parsed : null;
  } catch { return null; }
}
