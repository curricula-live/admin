"use client";
import { useMemo, useState } from "react";
import { nodes as snapshotNodes, edges as snapshotEdges, type AtlasNode, type AtlasEdge } from "./atlas-fixture";

export type AtlasExplorerData = { nodes: readonly AtlasNode[]; edges: readonly AtlasEdge[]; source: string };

export default function AtlasExplorer({ data }: { data?: AtlasExplorerData }) {
  const nodes = data?.nodes ?? snapshotNodes;
  const edges = data?.edges ?? snapshotEdges;
  const [selected, setSelected] = useState("view:computer-science");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const active = nodes.find(n => n.id === selected) ?? nodes[0];
  const visible = useMemo(() => nodes.filter(n =>
    (filter === "all" || n.area === filter) &&
    (n.label.toLowerCase().includes(query.trim().toLowerCase()) ||
      n.id.toLowerCase().includes(query.trim().toLowerCase()))
  ), [query, filter]);
  const connections = edges.filter(e => e.from === active.id || e.to === active.id);
  const related = (id: string): AtlasNode | undefined => nodes.find(n => n.id === id);
  const areas = [...new Set(nodes.map(n => n.area))];
  return (
    <div className="atlas-workspace">
      <aside className="atlas-sidebar" aria-label="Knowledge navigation">
        <p className="atlas-overline">KNOWLEDGE / EXPLORER</p>
        <h2>Computer Science</h2>
        <button className="atlas-text-button" onClick={() => { setSelected("view:computer-science"); setFilter("all"); setQuery(""); }}>Overview</button>
        <label htmlFor="atlas-search">Search concepts</label>
        <input id="atlas-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or identity…" />
        <label htmlFor="atlas-filter">Area</label>
        <select id="atlas-filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All areas</option>
          {areas.filter(a => a !== "Overview").map(area => <option key={area} value={area}>{area}</option>)}
        </select>
        <p className="atlas-muted">{visible.length} concepts · {data?.source ?? "Canonical development Git snapshot · not published"}</p>
        <nav aria-label="Concepts" className="atlas-concepts">
          {visible.map(n => <button key={n.id} aria-current={selected === n.id ? "page" : undefined} className={selected === n.id ? "atlas-concept active" : "atlas-concept"} onClick={() => setSelected(n.id)}>
            <span>{n.label}</span><small>{n.area}</small>
          </button>)}
          {visible.length === 0 && <p className="atlas-muted">No matching concepts.</p>}
        </nav>
      </aside>
      <section className="atlas-main" aria-label="Selected concept">
        <div className="atlas-breadcrumb">
          <button onClick={() => { setSelected("view:computer-science"); setFilter("all"); }}>Computer Science</button>
          <span>/</span>
          <button onClick={() => { setFilter(active.area === "Overview" ? "all" : active.area); setQuery(""); }}>{active.area}</button>
        </div>
        <p className="atlas-overline">CONCEPT INSPECTOR</p>
        <h2>{active.label}</h2>
        <p className="atlas-identity"><strong>Identity:</strong> <code>{active.id}</code></p>
        <div className="atlas-warning" role="status">{active.id.startsWith("view:") ? "Navigation overview (not a canonical concept)." : "Canonical UUID from an unverified knowledge source. Publication and scholarly review are not verified; no evidence is attached."}</div>
        <h3>Definition</h3>
        <p>{active.definition ?? "No reviewed definition available."}</p>
        <h3>Relationships <span className="atlas-muted">({connections.length})</span></h3>
        <div className="atlas-relationships">
          {connections.map((e, i) => {
            const other = related(e.from === active.id ? e.to : e.from);
            return <button key={i} onClick={() => other && setSelected(other.id)} className="atlas-relation">
              <span>{e.from === active.id ? "Outgoing" : "Incoming"} · {e.type}</span>
              <strong>{other?.label ?? "Unknown concept"} →</strong>
            </button>;
          })}
          {!connections.length && <p className="atlas-muted">No relationships recorded.</p>}
        </div>
        <h3>References & provenance</h3>
        <p className="atlas-muted">No verified references are attached. The identities and relations originate from canonical development data. This is not evidence of publication or scholarly review.</p>
        <h3>Review state</h3>
        <p>{active.status === "missing" ? "Navigation overview / missing evidence" : "Canonical identity — review and publication unverified"}</p>
      </section>
    </div>
  );
}
