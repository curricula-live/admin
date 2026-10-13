/** Bounded public Atlas preview fetch. No owner token, BFF secret or cookie is forwarded.
 * This is an opt-in staging read, not the public published v2 contract.
 */
import "server-only";
import type { AtlasNode, AtlasEdge } from "@/app/atlas/atlas-fixture";

export type AtlasRead = { nodes: AtlasNode[]; edges: AtlasEdge[]; source: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AnyRecord = Record<string, unknown>;
const record = (value: unknown): value is AnyRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseAtlasPreview(value: unknown): AtlasRead | null {
  if (!record(value) || value.contract_version !== "atlas-preview@1" ||
      value.release_verified !== false || value.review_verified !== false ||
      !Array.isArray(value.concepts) || !Array.isArray(value.relationships) ||
      value.concepts.length > 20 || value.relationships.length > 100) return null;
  const nodes: AtlasNode[] = [];
  const seen = new Set<string>();
  for (const item of value.concepts) {
    if (!record(item) || typeof item.id !== "string" || !UUID.test(item.id) ||
        typeof item.label !== "string" || !item.label.trim() || item.label.length > 200 ||
        typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
        typeof item.area_hint !== "string" || item.area_hint.length > 80 || seen.has(item.id)) return null;
    seen.add(item.id);
    nodes.push({ id:item.id, label:item.label, field:"Computer Science",
      area:item.area_hint, definition:null, status:"unreviewed", references:[] });
  }
  const edges: AtlasEdge[] = [];
  for (const item of value.relationships) {
    if (!record(item) || typeof item.id !== "string" || !UUID.test(item.id) ||
        typeof item.from !== "string" || !seen.has(item.from) ||
        typeof item.to !== "string" || !seen.has(item.to) ||
        typeof item.type !== "string" || !/^[a-z][a-z0-9_]*$/.test(item.type)) return null;
    edges.push({ id:item.id, from:item.from, to:item.to, type:item.type });
  }
  return { nodes:[{ id:"view:computer-science", label:"Computer Science", field:"Computer Science",
    area:"Overview", definition:null, status:"missing", references:[] },...nodes],
    edges, source:"Unauthenticated staging v2 read · unpublished/unreviewed" };
}

export async function readPublicAtlasPreview(): Promise<AtlasRead | null> {
  if (process.env.ATLAS_PUBLIC_DATA_PREVIEW_ENABLED !== "true") return null;
  const raw = process.env.CURRICULA_API_ORIGIN;
  if (!raw) return null;
  let base: URL;
  try {
    base = new URL(raw);
    if (base.pathname !== "/" || base.search || base.hash || base.username || base.password) return null;
    const remote = base.origin === "https://api.curricula.live";
    const local = process.env.NODE_ENV !== "production" && base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname) && ["8000", "8080"].includes(base.port);
    if (!remote && !local) return null;
  } catch { return null; }
  try {
    const response = await fetch(new URL("/v2-preview/atlas/", base), {
      method:"GET", cache:"no-store", redirect:"error",
      headers:{ Accept:"application/json" }, signal:AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parseAtlasPreview(await response.json());
  } catch { return null; }
}
