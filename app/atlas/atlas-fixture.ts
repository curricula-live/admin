/** Explicitly synthetic development content. Never present fixture IDs as canonical UUIDs or scholarly citations. */
export type AtlasNode = { id: string; label: string; field: string; area: string; definition: string | null; status: "fixture" | "missing"; references: readonly string[] };
export type AtlasEdge = { from: string; to: string; type: string };
export const nodes: readonly AtlasNode[] = [
  { id:"fixture:cs",label:"Computer Science",field:"Computer Science",area:"Overview",definition:null,status:"missing",references:[] },
  { id:"fixture:os",label:"Operating Systems",field:"Computer Science",area:"Operating Systems",definition:null,status:"missing",references:[] },
  { id:"fixture:process",label:"Process",field:"Computer Science",area:"Operating Systems",definition:"A program in execution (illustrative, unreviewed definition).",status:"fixture",references:[] },
  { id:"fixture:thread",label:"Thread",field:"Computer Science",area:"Operating Systems",definition:"A sequence of execution within a process (illustrative, unreviewed definition).",status:"fixture",references:[] },
  { id:"fixture:scheduling",label:"CPU Scheduling",field:"Computer Science",area:"Operating Systems",definition:"Selection of runnable work for processor execution (illustrative, unreviewed definition).",status:"fixture",references:[] },
  { id:"fixture:memory",label:"Virtual Memory",field:"Computer Science",area:"Operating Systems",definition:"An abstraction of memory addresses used by processes (illustrative, unreviewed definition).",status:"fixture",references:[] },
  { id:"fixture:filesystem",label:"File Systems",field:"Computer Science",area:"Operating Systems",definition:"Mechanisms for organizing and accessing persistent files (illustrative, unreviewed definition).",status:"fixture",references:[] },
  { id:"fixture:networks",label:"Computer Networks",field:"Computer Science",area:"Computer Networks",definition:null,status:"missing",references:[] },
  { id:"fixture:algorithms",label:"Algorithms",field:"Computer Science",area:"Algorithms",definition:null,status:"missing",references:[] },
  { id:"fixture:databases",label:"Databases",field:"Computer Science",area:"Databases",definition:null,status:"missing",references:[] }
];
export const edges: readonly AtlasEdge[] = [
  {from:"fixture:cs",to:"fixture:os",type:"includes (fixture)"},
  {from:"fixture:cs",to:"fixture:networks",type:"includes (fixture)"},
  {from:"fixture:cs",to:"fixture:algorithms",type:"includes (fixture)"},
  {from:"fixture:cs",to:"fixture:databases",type:"includes (fixture)"},
  {from:"fixture:os",to:"fixture:process",type:"covers (fixture)"},
  {from:"fixture:os",to:"fixture:memory",type:"covers (fixture)"},
  {from:"fixture:os",to:"fixture:filesystem",type:"covers (fixture)"},
  {from:"fixture:process",to:"fixture:thread",type:"contains (fixture)"},
  {from:"fixture:process",to:"fixture:scheduling",type:"scheduled by (fixture)"}
];
