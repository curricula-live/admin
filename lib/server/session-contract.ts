/** Fail-closed owner BFF contract. No authentication or public route is enabled. */
export const OWNER_COOKIE_NAME = "__Host-curricula_admin_session";
export const OWNER_SESSION_CONTRACT = "owner-session@1";

export type OwnerIdentity = Readonly<{
  subjectId: string;
  role: "owner";
  expiresAt: string;
}>;

type JsonResponse = { ok: boolean; json(): Promise<unknown> };
type ServerFetch = (url: string, init: RequestInit) => Promise<JsonResponse>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;

/** Never allow arbitrary server-side origins or credential-bearing URLs. */
export function sessionVerificationUrl(raw: string | undefined, production: boolean): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const trustedRemote = url.protocol === "https:" && url.hostname === "api.curricula.live" && !url.port;
    const local = url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      (url.port === "8000" || url.port === "8080");
    if (!(trustedRemote || (!production && local))) return null;
    return new URL("/v1/admin/auth/session/", url.origin).toString();
  } catch {
    return null;
  }
}

/** Accept only an unexpired, API-attested active owner identity. */
export function parseOwnerIdentity(value: unknown, now: Date): OwnerIdentity | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.contract_version !== OWNER_SESSION_CONTRACT ||
    record.authenticated !== true ||
    record.active !== true ||
    record.role !== "owner" ||
    typeof record.subject_id !== "string" ||
    !ID.test(record.subject_id) ||
    typeof record.expires_at !== "string"
  ) return null;
  const expiresAt = Date.parse(record.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;
  return { subjectId: record.subject_id, role: "owner", expiresAt: record.expires_at };
}

/** Server-to-server only; deny missing, expired, revoked or unverifiable sessions. */
export async function verifyOwnerSession(
  token: string | undefined,
  apiOrigin: string | undefined,
  production: boolean,
  requester: ServerFetch,
  now: Date = new Date()
): Promise<OwnerIdentity | null> {
  const url = sessionVerificationUrl(apiOrigin, production);
  if (!url || !token || !TOKEN.test(token)) return null;

  try {
    const response = await requester(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error"
    });
    if (!response.ok) return null;
    return parseOwnerIdentity(await response.json(), now);
  } catch {
    return null;
  }
}
