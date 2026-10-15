"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicConcept, PublicDetail, PublicStatement } from "@/lib/server/public-atlas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type EvidenceFilter = "all" | "unreviewed" | "missing";

export default function LiveAtlasExplorer({concepts, releaseCommit}: {concepts:PublicConcept[]; releaseCommit:string}) {
  const [query,setQuery] = useState("");
  const [area,setArea] = useState<string|null>(null);
  const [selected,setSelected] = useState<string|null>(null);
  const selectionRef = useRef<string|null>(null);
  const [detail,setDetail] = useState<PublicDetail|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [loading,setLoading] = useState(false);
  const [filter,setFilter] = useState<EvidenceFilter>("all");
  const [view,setView] = useState<"list"|"map">("list");
  const groups = useMemo(() => {
    const index = new Map<string,PublicConcept[]>();
    for (const concept of concepts) {
      const letter = /^[A-Z]$/i.test(concept.label[0] ?? "") ? concept.label[0].toUpperCase() : "#";
      index.set(letter,[...(index.get(letter)??[]),concept]);
    }
    return [...index].sort(([a],[b])=>a.localeCompare(b));
  },[concepts]);
  const visible = useMemo(() => concepts.filter(c =>
    (!area || (c.label[0]??"").toUpperCase()===area) &&
    [c.label,c.slug,c.id].some(v=>v.toLowerCase().includes(query.trim().toLowerCase()))
  ),[concepts,area,query]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("concept");
      const next = id && UUID.test(id) && concepts.some(c=>c.id===id) ? id : null;
      if (selectionRef.current !== next) {
        setDetail(null); setError(null); setLoading(Boolean(next));
      }
      selectionRef.current = next;
      setSelected(next);
      setArea(params.get("area"));
      setQuery(params.get("q")??"");
    };
    restore(); window.addEventListener("popstate",restore);
    return () => window.removeEventListener("popstate",restore);
  },[concepts]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/atlas/concepts/${selected}`,{cache:"no-store",signal:controller.signal})
      .then(async r=>{if (!r.ok) throw new Error(`Concept request failed (HTTP ${r.status}).`); return r.json() as Promise<PublicDetail>})
      .then(payload=>{
        if (payload.concept.id!==selected || payload.release_commit!==releaseCommit) throw new Error("Knowledge release changed; reload Atlas.");
        setDetail(payload);
      }).catch(e=>{if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Knowledge unavailable.");})
      .finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[selected,releaseCommit]);
  const navigate = (nextId:string|null,nextArea:string|null=area,nextQuery:string=query,replace=false) => {
    const params = new URLSearchParams();
    if (nextId) params.set("concept",nextId);
    if (nextArea) params.set("area",nextArea);
    if (nextQuery) params.set("q",nextQuery);
    window.history[replace?"replaceState":"pushState"](null,"",`/atlas${params.size?`?${params}`:""}`);
    if (selectionRef.current !== nextId) {
      setDetail(null); setError(null); setLoading(Boolean(nextId));
    }
    selectionRef.current = nextId;
    setSelected(nextId); setArea(nextArea); setQuery(nextQuery);
  };
  const matching = detail?.statements.filter(s=>filter==="all" ||
    (filter==="unreviewed" && s.review_state==="unreviewed") ||
    (filter==="missing" && s.evidence.status==="missing"))??[];
  const related = (id:string) => concepts.find(c=>c.id===id);
  const relationship = (s:PublicStatement) => s.subject.kind==="concept" && s.object.kind==="concept";
  return <div className="atlas-workspace">
    <aside className="atlas-sidebar" aria-label="Knowledge navigation">
      <p className="atlas-overline">PUBLISHED KNOWLEDGE / INDEX</p><h2>Computer Science</h2>
      <p className="atlas-muted">Alphabetic areas organize navigation only. ACM CCS, CS2023 and CSTA memberships are not yet supplied by this release.</p>
      <button className="atlas-text-button" onClick={()=>navigate(null,null,"")}>Overview</button>
      <label htmlFor="atlas-search">Search concepts</label>
      <input id="atlas-search" type="search" value={query} onChange={e=>navigate(selected,area,e.target.value,true)} placeholder="Label, slug or UUID" />
      <p className="atlas-muted">{visible.length} of {concepts.length} canonical concepts</p>
      <nav aria-label="Alphabetic areas" className="atlas-concepts">
        {groups.map(([letter,items])=><div key={letter}>
          <button className="atlas-text-button" aria-expanded={area===letter} onClick={()=>navigate(null,area===letter?null:letter,query)}>{letter} ({items.length})</button>
          {(area===letter || !!query) && items.filter(c=>visible.some(v=>v.id===c.id)).map(c=><button key={c.id} className={selected===c.id?"atlas-concept active":"atlas-concept"} aria-current={selected===c.id?"page":undefined} onClick={()=>navigate(c.id,letter,query)}><span>{c.label}</span><small>{c.slug}</small></button>)}
        </div>)}
        {!visible.length && <p className="atlas-muted">No matching concepts.</p>}
      </nav>
    </aside>
    <section className="atlas-main" aria-label="Knowledge inspector">
      <div className="atlas-breadcrumb"><button onClick={()=>navigate(null,null,"")}>Computer Science</button>{area && <><span>/</span><button onClick={()=>navigate(null,area,query)}>{area} index</button></>}{detail && <><span>/</span><span>{detail.concept.label}</span></>}</div>
      {!selected && <><p className="atlas-overline">KNOWLEDGE ATLAS</p><h2>{area?`${area} index`:"Explore the knowledge index"}</h2><p>Select an alphabetic area, then a concept. The index represents canonical UUID identities without asserting an unsupported classification hierarchy.</p><div className="atlas-area-grid">{groups.map(([letter,items])=><button className="atlas-area-card" key={letter} onClick={()=>navigate(null,letter,"")}><strong>{letter}</strong><span>{items.length} concepts →</span></button>)}</div></>}
      {loading && <p role="status">Loading live concept data…</p>}
      {error && <div className="atlas-warning" role="alert">{error} No snapshot was substituted.</div>}
      {detail && <>
        <p className="atlas-overline">CANONICAL CONCEPT</p><h2>{detail.concept.label}</h2>
        <p className="atlas-identity"><strong>UUID:</strong> <code>{detail.concept.id}</code> · <strong>Slug:</strong> <code>{detail.concept.slug}</code></p>
        <div className="atlas-warning">Published identity from release <code>{releaseCommit.slice(0,12)}</code>. Scholarly review and evidence are not asserted.</div>
        <h3>Definition</h3>{detail.definition.status==="missing"?<p>No canonical definition is published for this concept.</p>:<ul>{detail.definition.statements.map(s=><li key={s.id}>{s.predicate.replaceAll("_"," ")} · statement <code>{s.id}</code></li>)}</ul>}
        <div className="atlas-relation-heading"><h3>Statements and relationships ({matching.length})</h3><div role="group" aria-label="Relationship view"><button aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button><button aria-pressed={view==="map"} onClick={()=>setView("map")}>Map</button></div></div>
        <label htmlFor="evidence-filter">Evidence state</label> <select id="evidence-filter" value={filter} onChange={e=>setFilter(e.target.value as EvidenceFilter)}><option value="all">All</option><option value="unreviewed">Unreviewed</option><option value="missing">Missing evidence</option></select>
        {view==="map" && <div className="atlas-context-map" aria-label="Contextual typed graph"><div className="atlas-map-center"><span>Selected concept</span><strong>{detail.concept.label}</strong></div><div className="atlas-map-neighbors">{matching.filter(relationship).map(s=>{const outgoing=s.subject.id===selected; const other=related((outgoing?s.object:s.subject).id!);return <button className="atlas-map-neighbor" key={s.id} onClick={()=>other&&navigate(other.id,(other.label[0]??"").toUpperCase(),"")}><span>{outgoing?"→":"←"} {s.predicate.replaceAll("_"," ")}</span><strong>{other?.label??"Related UUID"}</strong><small>{s.id} · unreviewed · evidence missing</small></button>})}</div></div>}
        {view==="list" && <div className="atlas-relationships">{matching.map(s=>{const other=relationship(s)?related((s.subject.id===selected?s.object:s.subject).id!):null;return <button className="atlas-relation" key={s.id} onClick={()=>other&&navigate(other.id,(other.label[0]??"").toUpperCase(),"")} disabled={!other}><span>{s.predicate.replaceAll("_"," ")}</span><strong>{other?.label??(s.object.kind==="literal"?"Literal statement":"Statement reference")}</strong><small>Statement {s.id} · unreviewed · evidence missing</small></button>})}</div>}
        {!matching.length && <p>No statements match this filter.</p>}
        <h3>Evidence and provenance</h3><p>No scholarly references are attached to this release. Statements are marked unreviewed and evidence is missing.</p>
        <h3>Classification overlays</h3><p>ACM CCS, CS2023 and CSTA mappings are unavailable in the canonical release.</p>
      </>}
    </section>
  </div>;
}
