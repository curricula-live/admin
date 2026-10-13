/** Canonical Git data snapshot (curricula-live/data dev, 2026-10-13).
 * UUIDs and statement IDs are copied unchanged from knowledge/*.jsonl.
 * This is NOT a verified published PostgreSQL release; no definitions or citations exist in the source snapshot.
 * Area labels are a UI navigation grouping, not asserted taxonomy statements.
 */
export type AtlasNode = { id: string; label: string; field: string; area: string; definition: string | null; status: "unreviewed" | "missing"; references: readonly string[] };
export type AtlasEdge = { id: string; from: string; to: string; type: string };
export const nodes: readonly AtlasNode[] = [
  {
    "id": "view:computer-science",
    "label": "Computer Science",
    "field": "Computer Science",
    "area": "Overview",
    "definition": null,
    "status": "missing",
    "references": []
  },
  {
    "id": "02ef4418-9ed4-5aba-bff4-4ee16a7651fa",
    "label": "Algorithm",
    "field": "Computer Science",
    "area": "Algorithms",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "db28edbc-c1bf-5412-b5ec-e97d960daa7a",
    "label": "Computer Network",
    "field": "Computer Science",
    "area": "Computer Networks",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "e918759b-e253-5081-8640-a42c94622e65",
    "label": "CPU",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "2f57bed1-a194-54a2-84b3-13b2f8e637e6",
    "label": "Database",
    "field": "Computer Science",
    "area": "Databases",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "a363a776-30f0-5c1d-983d-339a464062f7",
    "label": "File System",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "990e2cd1-cfd0-5776-94ce-1c000b46ee7f",
    "label": "Memory",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "c74fe051-ac5e-521b-8770-3180fb0decb6",
    "label": "Operating System",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "e9272fce-a569-5108-8def-0c35542cb640",
    "label": "Process",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "628bb601-3435-5f31-8a1b-8334bd3ef102",
    "label": "Processor",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  },
  {
    "id": "6364f7df-8140-520e-875b-7aab9650d1eb",
    "label": "Thread",
    "field": "Computer Science",
    "area": "Operating Systems",
    "definition": null,
    "status": "unreviewed",
    "references": []
  }
];
export const edges: readonly AtlasEdge[] = [
  {
    "id": "26668f26-3e71-4dc6-8d3c-599e33425985",
    "from": "6364f7df-8140-520e-875b-7aab9650d1eb",
    "to": "e9272fce-a569-5108-8def-0c35542cb640",
    "type": "part_of"
  },
  {
    "id": "49100646-6a42-4269-9c62-76b8e42a2295",
    "from": "a363a776-30f0-5c1d-983d-339a464062f7",
    "to": "c74fe051-ac5e-521b-8770-3180fb0decb6",
    "type": "part_of"
  },
  {
    "id": "8b336916-f74a-43e9-a1a0-2c7418c6c428",
    "from": "e9272fce-a569-5108-8def-0c35542cb640",
    "to": "628bb601-3435-5f31-8a1b-8334bd3ef102",
    "type": "uses"
  },
  {
    "id": "d98fa7bb-d56d-4d01-87b0-24e9e99e3220",
    "from": "e918759b-e253-5081-8640-a42c94622e65",
    "to": "628bb601-3435-5f31-8a1b-8334bd3ef102",
    "type": "subtype_of"
  }
];
