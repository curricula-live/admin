import "server-only";
/** Server-to-server owner challenge exchange. Never imported by client code. */
import { ownerAuthConfig, ownerAuthApiUrl, parseIssuedOwnerSession,
  type AuthConfig, type AuthOperation, type IssuedOwnerSession } from "./owner-auth-policy";
import { verifyOwnerSession } from "./session-contract";

export function configuredOwnerAuth(): AuthConfig | null {
  return ownerAuthConfig({
    APP_ENV: process.env.APP_ENV,
    ADMIN_OWNER_LOGIN_ENABLED: process.env.ADMIN_OWNER_LOGIN_ENABLED,
    OWNER_BFF_SHARED_SECRET: process.env.OWNER_BFF_SHARED_SECRET,
    CURRICULA_API_ORIGIN: process.env.CURRICULA_API_ORIGIN,
    ADMIN_PUBLIC_ORIGIN: process.env.ADMIN_PUBLIC_ORIGIN
  });
}

async function trustedPost(
  config: AuthConfig,
  operation: AuthOperation,
  body: Record<string, string> | null,
  bearer?: string
): Promise<Response | null> {
  try {
    const headers: Record<string, string> = {
      "X-Admin-BFF-Secret": config.sharedSecret,
      Accept: "application/json"
    };
    if (body) headers["Content-Type"] = "application/json";
    if (bearer) headers.Authorization = "Bearer " + bearer;
    return await fetch(ownerAuthApiUrl(config, operation), {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error"
    });
  } catch {
    return null;
  }
}

/** Response must remain neutral, regardless of owner lookup or mail errors. */
export async function requestOwnerEmail(config: AuthConfig, email: string): Promise<void> {
  await trustedPost(config, "request", { email });
}

/** Validates the returned bearer using the independent owner-attestation endpoint. */
export async function redeemOwnerEmail(
  config: AuthConfig,
  challenge: string
): Promise<IssuedOwnerSession | null> {
  const response = await trustedPost(config, "redeem", { challenge });
  if (!response || !response.ok ||
      !response.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  try {
    const session = parseIssuedOwnerSession(await response.json());
    if (!session) return null;
    const identity = await verifyOwnerSession(
      session.token, config.apiOrigin, process.env.NODE_ENV === "production", fetch
    );
    if (!identity) {
      // Best effort: never install a cookie for a bearer rejected by the API.
      await trustedPost(config, "logout", null, session.token);
      return null;
    }
    const authoritativeExpiry = Date.parse(identity.expiresAt);
    const seconds = Math.floor((Math.min(authoritativeExpiry, Date.parse(session.expiresAt)) - Date.now()) / 1000);
    if (!Number.isFinite(seconds) || seconds < 1) {
      await trustedPost(config, "logout", null, session.token);
      return null;
    }
    return { ...session, maxAge: Math.min(seconds, session.maxAge) };
  } catch {
    return null;
  }
}

export async function revokeOwnerSession(config: AuthConfig, bearer: string): Promise<boolean> {
  const response = await trustedPost(config, "logout", null, bearer);
  return response?.status === 204;
}
