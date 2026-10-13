import { notFound, redirect } from "next/navigation";
import OwnerLogoutButton from "./owner-logout-button";
import AtlasExplorer from "./atlas-explorer";
import { readPublicAtlasPreview } from "@/lib/server/public-atlas-preview";
import { currentOwnerIdentity } from "@/lib/server/owner-session";
import { atlasAccessDecision } from "@/lib/server/owner-access-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Authenticated, read-only Atlas preview. Fixture content is explicitly noncanonical. */
export default async function AtlasOwnerShell() {
  if (process.env.ADMIN_OWNER_PREVIEW_ENABLED !== "true") notFound();
  const identity = await currentOwnerIdentity();
  if (atlasAccessDecision(true, identity) !== "owner") redirect("/login");
  const atlasData = await readPublicAtlasPreview();
  return (
    <main className="atlas-page">
      <header className="atlas-header">
        <div><span className="eyebrow">curricula.live / owner workspace</span><h1>Knowledge Atlas</h1></div>
        <OwnerLogoutButton />
      </header>
      <AtlasExplorer data={atlasData ?? undefined} />
    </main>
  );
}
