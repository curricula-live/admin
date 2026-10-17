import { notFound, redirect } from "next/navigation";
import OwnerLogoutButton from "./owner-logout-button";
import LiveAtlasExplorer from "./live-atlas-explorer";
import { readPublicAtlasConcepts } from "@/lib/server/public-atlas";
import { currentOwnerIdentity } from "@/lib/server/owner-session";
import { atlasAccessDecision } from "@/lib/server/owner-access-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AtlasOwnerShell() {
  if (process.env.ADMIN_OWNER_PREVIEW_ENABLED !== "true") notFound();
  const identity = await currentOwnerIdentity();
  if (atlasAccessDecision(true,identity) !== "owner") redirect("/login");
  const result = await readPublicAtlasConcepts();
  return <main className="atlas-page">
    <header className="atlas-header"><div><span className="eyebrow">curricula.live / owner workspace</span><h1>Knowledge Atlas</h1></div><OwnerLogoutButton /></header>
    {result.error || !result.releaseCommit ? <section className="atlas-main" role="alert"><h2>Public knowledge unavailable</h2><p>{result.error}</p><p>Check the public API release and retry.</p></section> :
      <LiveAtlasExplorer concepts={result.concepts} releaseCommit={result.releaseCommit} />}
  </main>;
}
