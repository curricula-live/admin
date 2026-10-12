/** Testable security contract for admin-to-Django BFF communications.
 * Kept separate from Next server runtime so negative cases run in node:test.
 */
import { sessionVerificationUrl, type OwnerIdentity } from "./session-contract.ts";

const CREDENTIAL = /^[A-Za-z0-9_-]{32,256}$/;
const OWNER_MAX_SESSION_MS = 8 * 60 * 60 * 1000;

export type IssuedSession = Readonly<{
  token: string;
  expiresAt: Date;
}>;

export function configuredAdminOrigin(raw: string | undefined, production: boolean, stage?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const deployed = url.origin === "https://admin.curricula.live";
    const local = !production && (
      url.origin === "http://localhost:3000" ||
      url.origin === "http://127.0.0.1:3000"
    );
    // Exact TLS fixture for disposable CI. Never allow an arbitrary preview
    // host or port; NODE_ENV=production and APP_ENV!=staging both deny it.
    const localTlsStaging = !production && stage === "staging" &&
      url.origin === "https://localhost:3443";
    return deployed || local || localTlsStaging ? url.origin : null;
  } catch {
    return null;
  }
}

/** Origin is required, even if SameSite cookies would otherwise be sent. */
export function validBrowserPost(
  origin: string | null,
  fetchSite: string | null,
  configured: string | undefined,
  production: boolean,
  stage?: string
): boolean {
  const expected = configuredAdminOrigin(configured, production, stage);
  return !!expected && origin === expected && (
    fetchSite === null || fetchSite === "same-origin"
  );
}

/** An env flag alone cannot enable owner auth on production hosts. */
export function ownerAuthStageEnabled(stage: string | undefined, enabled: string | undefined): boolean {
  return enabled === "true" && (stage === "staging" || stage === "development");
}

export type OwnerAuthOperation = "request" | "redeem" | "logout";

export function authBackendEndpoint(
  origin: string | undefined,
  production: boolean,
  operation: OwnerAuthOperation
): string | null {
  const verification = sessionVerificationUrl(origin, production);
  if (!verification) return null;
  return new URL(`/v1/admin/auth/${operation}/`, verification).toString();
}

/** Never accept unexpected upstream credentials or a forged expiry. */
export function parseIssuedSession(value: unknown, now: Date = new Date()): IssuedSession | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.session_token !== "string" ||
    !CREDENTIAL.test(row.session_token) ||
    typeof row.expires_at !== "string"
  ) return null;

  const millis = Date.parse(row.expires_at);
  if (!Number.isFinite(millis)) return null;
  const lifetime = millis - now.getTime();
  if (lifetime <= 0 || lifetime > OWNER_MAX_SESSION_MS + 60_000) return null;
  return { token: row.session_token, expiresAt: new Date(millis) };
}

export function isValidChallenge(value: unknown): value is string {
  return typeof value === "string" && CREDENTIAL.test(value);
}

export function secureOwnerCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true as const,
    secure: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    expires: expiresAt,
    // No Domain property; __Host- cookies must be host-only.
  };
}


/** Bound browser-cookie lifetime to a freshly attested, active Django owner. */
export function verifiedOwnerCookieExpiry(
  issued: IssuedSession, owner: OwnerIdentity | null, now: Date = new Date()
): Date | null {
  if (!owner || owner.role !== "owner") return null;
  const authoritative = Date.parse(owner.expiresAt);
  if (!Number.isFinite(authoritative)) return null;
  const expiry = Math.min(issued.expiresAt.getTime(), authoritative);
  if (expiry <= now.getTime() || expiry > now.getTime() + OWNER_MAX_SESSION_MS + 60_000) return null;
  return new Date(expiry);
}
