/** Pure security boundary for browser -> admin BFF -> Django authentication. */
export type AuthOperation = "request" | "redeem" | "logout";
export type AuthConfig = Readonly<{
  apiOrigin: string;
  publicOrigin: string;
  sharedSecret: string;
  appEnv: "staging" | "development";
}>;
const PATHS: Record<AuthOperation, string> = {
  request: "/v1/admin/auth/request/",
  redeem: "/v1/admin/auth/redeem/",
  logout: "/v1/admin/auth/logout/"
};
const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
export const NEUTRAL_REQUEST_RESPONSE = {
  message: "If an eligible account exists, a sign-in email will be sent."
} as const;
export const MAX_JSON_BYTES = 2048;

function exactOrigin(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.pathname !== "/" || !["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Explicitly opt in to a non-production deployment; no inferred hostnames. */
export function ownerAuthConfig(env: Record<string, string | undefined>): AuthConfig | null {
  if (env.ADMIN_OWNER_LOGIN_ENABLED !== "true" ||
      (env.APP_ENV !== "staging" && env.APP_ENV !== "development")) return null;
  const secret = env.OWNER_BFF_SHARED_SECRET;
  if (!secret || secret.length < 32) return null;
  const api = exactOrigin(env.CURRICULA_API_ORIGIN);
  const browser = exactOrigin(env.ADMIN_PUBLIC_ORIGIN);
  if (!api || !browser) return null;
  const remoteApi = api.protocol === "https:" && api.hostname === "api.curricula.live" && !api.port;
  const localApi = env.APP_ENV === "development" && api.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(api.hostname) &&
    ["8000", "8080"].includes(api.port);
  const remoteBrowser = browser.protocol === "https:" &&
    browser.hostname === "admin.curricula.live" && !browser.port;
  const localBrowser = env.APP_ENV === "development" && browser.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(browser.hostname) && browser.port === "3000";
  if (!(remoteApi || localApi) || !(remoteBrowser || localBrowser)) return null;
  return { apiOrigin: api.origin, publicOrigin: browser.origin, sharedSecret: secret,
    appEnv: env.APP_ENV };
}

export function ownerAuthApiUrl(config: AuthConfig, operation: AuthOperation): string {
  return new URL(PATHS[operation], config.apiOrigin).toString();
}

/** Mutations require an exact, configured Origin; no Host or proxy-header trust. */
export function trustedBrowserPost(request: Request, config: AuthConfig): boolean {
  if (request.method !== "POST" || request.headers.get("origin") !== config.publicOrigin) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

/** Streams and caps request size before constructing a JSON value in memory. */
export async function readBoundedJson(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json" || !request.body) return null;
  const reported = request.headers.get("content-length");
  if (reported !== null && (!/^\d+$/.test(reported) || Number(reported) > MAX_JSON_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export function safeOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function safeEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 320) return null;
  const email = value.trim().toLowerCase();
  return email.length >= 3 && email.length <= 320 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export type IssuedOwnerSession = Readonly<{ token: string; expiresAt: string; maxAge: number }>;

/** Never set a cookie on unchecked API output, excessive TTL, or invalid tokens. */
export function parseIssuedOwnerSession(input: unknown, now = new Date()): IssuedOwnerSession | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (!safeOpaqueToken(data.session_token) || typeof data.expires_at !== "string") return null;
  const expires = Date.parse(data.expires_at);
  const lifetime = Math.floor((expires - now.getTime()) / 1000);
  if (!Number.isFinite(expires) || lifetime < 1 || lifetime > 8 * 3600 + 120) return null;
  return { token: data.session_token, expiresAt: data.expires_at,
    maxAge: Math.min(lifetime, 8 * 3600) };
}
