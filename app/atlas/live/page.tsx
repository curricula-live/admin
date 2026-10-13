import { notFound, redirect } from "next/navigation";
import LiveAtlasExplorer from "../live-atlas-explorer";
import { readPublicAtlasConcepts } from "@/lib/server/public-atlas";
import { currentOwnerIdentity } from "@/lib/server/owner-session";
import { atlasAccessDecision } from "@/lib/server/owner-access-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Separate preview route until the existing Atlas page is reconciled. */
export default async function PublicAtlasPreviewPage() {
  if (process.env.ADMIN_OWNER_PREVIEW_ENABLED !== "true") notFound();
  const identity = await currentOwnerIdentity();
  if (atlasAccessDecision(true, identity) !== "owner") redirect("/login");
  const result = await readPublicAtlasConcepts();
  return <main className="atlas-page">
    <header className="atlas-header"><div><span className="eyebrow">curricula.live / public knowledge preview</span><h1>Knowledge Atlas</h1></div></header>
    {result.error ? <section className="atlas-main" role="status"><h2>Public knowledge unavailable</h2><p>{result.error}</p><p>The preview will not substitute unpublished fixture records for live API data.</p></section> : <LiveAtlasExplorer concepts={result.concepts} />}
  </main>;
}
