"use client";
import { useMemo, useState } from "react";
import type { PublicConcept } from "@/lib/server/public-atlas";

export default function LiveAtlasExplorer({ concepts }: { concepts: PublicConcept[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const matches = useMemo(() => concepts.filter(c => [c.label, c.slug, c.id].some(v => v.toLowerCase().includes(query.toLowerCase().trim()))), [concepts, query]);
  const groups = useMemo(() => {
    const map = new Map<string, PublicConcept[]>();
    for (const concept of matches) {
      const first = concept.label.charAt(0).toUpperCase();
      const key = /^[A-Z]$/.test(first) ? first : "#";
      map.set(key, [...(map.get(key) ?? []), concept]);
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);
  const active = concepts.find(c => c.id === selected);
  return <div className="atlas-workspace">
    <aside className="atlas-sidebar" aria-label="Canonical concept navigation">
      <p className="atlas-overline">PUBLIC KNOWLEDGE</p><h2>Computer Science</h2>
      <label htmlFor="concept-search">Search concepts</label>
      <input id="concept-search" type="search" value={query} onChange={e => setQuery(e.target.value)} />
      <p className="atlas-muted">{matches.length} / {concepts.length} concepts</p>
      <p className="atlas-muted">Alphabetic grouping is a navigation projection, not a scientific taxonomy.</p>
      <nav className="atlas-concepts" aria-label="Concept index">
        {groups.map(([letter, items]) => <div key={letter}>
          <button className="atlas-text-button" aria-expanded={!!query || expanded.includes(letter)} onClick={() => setExpanded(old => old.includes(letter) ? old.filter(x => x !== letter) : [...old, letter])}>{letter} ({items.length})</button>
          {(!!query || expanded.includes(letter)) && items.map(c => <button key={c.id} className={selected === c.id ? "atlas-concept active" : "atlas-concept"} onClick={() => setSelected(c.id)}><span>{c.label}</span><small>{c.slug}</small></button>)}
        </div>)}
        {!groups.length && <p className="atlas-muted">No matching concepts.</p>}
      </nav>
    </aside>
    <section className="atlas-main" aria-label="Concept inspector">
      <p className="atlas-overline">CANONICAL CONCEPT INSPECTOR</p>
      {active ? <>
        <h2>{active.label}</h2>
        <p className="atlas-identity">UUID: <code>{active.id}</code></p>
        <p className="atlas-identity">Slug: <code>{active.slug}</code></p>
        <div className="atlas-warning">Development preview; publication and review not verified.</div>
        <h3>Definition</h3><p className="atlas-muted">Not exposed by the current public API contract.</p>
        <h3>Semantic relationships</h3><p className="atlas-muted">Not yet exposed by the canonical public API. No edges inferred from navigation groups.</p>
        <h3>Provenance</h3><p className="atlas-muted">Identity and label from the public v2 preview; no scholarly evidence supplied.</p>
      </> : <><h2>Explore concepts</h2><p>Select a concept from the index.</p></>}
    </section>
  </div>;
}
