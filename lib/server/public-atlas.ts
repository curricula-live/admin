/** Server-only reader for the stamped, anonymous knowledge-v2 contract. */
import "server-only";

export type PublicConcept = { id: string; slug: string; label: string };
export type PublicStatement = {
  id: string; predicate: string; subject: {kind:string; id:string};
  object: {kind:string; id?:string; datatype?:string; value?:unknown};
  review_state: "unreviewed"; evidence: {status:"missing"; references: []};
};
export type PublicDetail = {
  concept: PublicConcept;
  definition: {status:"missing"|"present"; statements: PublicStatement[]};
  evidence: {status:"missing"; references: []};
  classification: {status:"unavailable"; memberships: []};
  statements: PublicStatement[];
  release_commit: string;
};
export type AtlasCollection = { concepts: PublicConcept[]; error: string | null; releaseCommit: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT = /^[0-9a-f]{40}$/;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function apiOrigin(): URL {
  const raw = process.env.ATLAS_PUBLIC_API_ORIGIN;
  if (!raw) throw new Error("Set ATLAS_PUBLIC_API_ORIGIN to the public API origin.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Invalid public API origin."); }
  const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) && ["8000", "8080"].includes(url.port);
  const remote = url.origin === "https://api.curricula.live";
  if ((!local && !remote) || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new Error("Public API origin is not allowlisted.");
  return url;
}

async function get(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, apiOrigin()), {method:"GET", cache:"no-store", redirect:"error",
    headers:{Accept:"application/json"}, signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`Public API returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const expected = process.env.ATLAS_PUBLIC_RELEASE_COMMIT;
  if (!record(payload) || payload.contract_version !== "knowledge-v2@1" ||
      typeof payload.release_commit !== "string" || !COMMIT.test(payload.release_commit) ||
      (expected && payload.release_commit !== expected)) throw new Error("Public knowledge release mismatch.");
  return payload;
}

function concept(value: unknown): PublicConcept {
  if (!record(value) || typeof value.id !== "string" || !UUID.test(value.id) ||
      typeof value.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
      typeof value.label !== "string" || !value.label.trim() || value.label.length > 200)
    throw new Error("Invalid canonical concept response.");
  return {id:value.id, slug:value.slug, label:value.label};
}

export async function readPublicAtlasConcepts(): Promise<AtlasCollection> {
  const concepts: PublicConcept[] = [];
  const ids = new Set<string>();
  let releaseCommit: string | null = null;
  try {
    for (let offset=0; offset<1000; offset+=100) {
      const page = await get(`/v2/concepts/?limit=100&offset=${offset}`);
      if (!Array.isArray(page.results) || page.results.length > 100 || page.limit !== 100 ||
          page.offset !== offset || typeof page.has_more !== "boolean") throw new Error("Invalid concept page.");
      if (releaseCommit && page.release_commit !== releaseCommit) throw new Error("Knowledge release changed during read.");
      releaseCommit = page.release_commit as string;
      for (const item of page.results) {
        const c = concept(item);
        if (ids.has(c.id)) throw new Error("Duplicate canonical UUID.");
        ids.add(c.id); concepts.push(c);
      }
      if (!page.has_more) return {concepts,error:null,releaseCommit};
      if (!page.results.length) throw new Error("Invalid empty concept page.");
    }
    throw new Error("Knowledge collection exceeds the 1000-concept display bound.");
  } catch (error) {
    return {concepts:[],error:error instanceof Error ? error.message : "Public knowledge unavailable.",releaseCommit:null};
  }
}

function statement(value: unknown): PublicStatement {
  if (!record(value) || typeof value.id !== "string" || !UUID.test(value.id) ||
      typeof value.predicate !== "string" || !/^[a-z][a-z0-9_]*$/.test(value.predicate) ||
      !record(value.subject) || !record(value.object) ||
      value.review_state !== "unreviewed" || !record(value.evidence) ||
      value.evidence.status !== "missing" || !Array.isArray(value.evidence.references) || value.evidence.references.length)
    throw new Error("Invalid statement response.");
  const validRef = (r: Record<string, unknown>) =>
    (r.kind === "concept" || r.kind === "statement") && typeof r.id === "string" && UUID.test(r.id);
  if (!validRef(value.subject) || (!validRef(value.object) && value.object.kind !== "literal"))
    throw new Error("Invalid statement reference.");
  return value as PublicStatement;
}

export async function readPublicConceptDetail(id: string): Promise<PublicDetail> {
  if (!UUID.test(id)) throw new Error("Invalid concept identity.");
  const detail = await get(`/v2/concepts/${id}/`);
  const c = concept(detail.concept);
  if (c.id !== id || !record(detail.definition) || !["missing","present"].includes(String(detail.definition.status)) ||
      !Array.isArray(detail.definition.statements) || detail.definition.statements.length > 100 ||
      !record(detail.evidence) || detail.evidence.status !== "missing" ||
      !record(detail.classification) || detail.classification.status !== "unavailable")
    throw new Error("Invalid concept detail response.");
  const statements: PublicStatement[] = [];
  for (let offset=0; offset<=1000; offset+=100) {
    const page = await get(`/v2/concepts/${id}/statements/?limit=100&offset=${offset}`);
    if (page.release_commit !== detail.release_commit || page.concept_id !== id ||
        !Array.isArray(page.results) || page.results.length > 100 ||
        page.limit !== 100 || page.offset !== offset || typeof page.has_more !== "boolean")
      throw new Error("Invalid concept statement page.");
    statements.push(...page.results.map(statement));
    if (!page.has_more) return {concept:c,
      definition:{status:detail.definition.status as "missing"|"present", statements:detail.definition.statements.map(statement)},
      evidence:{status:"missing",references:[]}, classification:{status:"unavailable",memberships:[]},
      statements,release_commit:detail.release_commit as string};
  }
  throw new Error("Concept exceeds the statement display bound.");
}
