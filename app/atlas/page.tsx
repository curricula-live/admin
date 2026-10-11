import { notFound, redirect } from "next/navigation";
import OwnerLogoutButton from "./owner-logout-button";
import { currentOwnerIdentity } from "@/lib/server/owner-session";
import { atlasAccessDecision } from "@/lib/server/owner-access-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Guarded placeholder, never an authenticated Atlas data implementation. */
export default async function AtlasOwnerShell() {
  // No owner session token is even inspected when this gate is off.
  if (process.env.ADMIN_OWNER_PREVIEW_ENABLED !== "true") notFound();

  const identity = await currentOwnerIdentity();
  const access = atlasAccessDecision(true, identity);
  if (access !== "owner") redirect("/login");

  return (
    <main className="page">
      <section className="panel" aria-labelledby="atlas-title">
        <span className="eyebrow">curricula.live / owner workspace</span>
        <h1 id="atlas-title">Knowledge Atlas</h1>
        <p>Owner session verified. The Atlas is not yet connected to a published knowledge release.</p>
        <p className="secondary">
          Academic provenance, release identity and server-authorized graph queries
          must be verified before any knowledge content is displayed.
        </p>
        <OwnerLogoutButton />
      </section>
    </main>
  );
}
