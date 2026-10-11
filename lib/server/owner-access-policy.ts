/** Pure, auditable authorization decision for the server-rendered Atlas shell. */
import type { OwnerIdentity } from "./session-contract";

export type AtlasAccess = "disabled" | "unauthorized" | "owner";

export function atlasAccessDecision(
  enabled: boolean,
  identity: OwnerIdentity | null
): AtlasAccess {
  if (!enabled) return "disabled";
  if (!identity || identity.role !== "owner") return "unauthorized";
  const expiry = Date.parse(identity.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return "unauthorized";
  return "owner";
}
