/** Public canonical preview reader. Server-only: never forwards owner credentials. */
export type PublicConcept = { id: string; slug: string; label: string };
export type AtlasCollection = { concepts: PublicConcept[]; error: string | null };

export async function readPublicAtlasConcepts(): Promise<AtlasCollection> {
  const origin = process.env.ATLAS_PUBLIC_API_ORIGIN;
  if (!origin) return { concepts: [], error: "Set ATLAS_PUBLIC_API_ORIGIN to the public API origin to load canonical concepts." };
  let base: URL;
  try {
    base = new URL(origin);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("invalid origin");
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return { concepts: [], error: "Invalid ATLAS_PUBLIC_API_ORIGIN configuration." };
  }
  const concepts: PublicConcept[] = [];
  const seen = new Set<string>();
  try {
    for (let offset = 0; offset < 1000; offset += 100) {
      const url = new URL("/v2-preview/concepts/", base);
      url.searchParams.set("limit", "100");
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000), redirect: "error" });
      if (!response.ok) throw new Error(`Public API returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("results" in payload) || !Array.isArray(payload.results)) throw new Error("Unexpected public API response");
      for (const item of payload.results) {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.slug !== "string" || typeof item.label !== "string") throw new Error("Invalid concept identity");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) throw new Error("Invalid canonical UUID");
        if (!seen.has(item.id)) { seen.add(item.id); concepts.push({ id: item.id, slug: item.slug, label: item.label }); }
      }
      if (payload.results.length < 100) break;
      if (offset === 900) throw new Error("Concept collection exceeds preview limit of 1,000");
    }
    return { concepts, error: null };
  } catch (error) {
    return { concepts: [], error: error instanceof Error ? error.message : "Public knowledge API unavailable" };
  }
}
