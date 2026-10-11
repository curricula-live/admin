/** Server-only bridge. The browser never receives BFF credentials or API sessions. */
import "server-only";
import {
  authBackendEndpoint,
  configuredAdminOrigin,
  ownerAuthStageEnabled,
  validBrowserPost,
  type OwnerAuthOperation,
} from "./owner-auth-bff-contract";

const MAX_REQUEST_BYTES = 2048;

export function ownerLoginEnabled(): boolean {
  const secret = process.env.OWNER_BFF_SHARED_SECRET;
  const production = process.env.NODE_ENV === "production";
  return ownerAuthStageEnabled(process.env.APP_ENV, process.env.ADMIN_OWNER_LOGIN_ENABLED) &&
    typeof secret === "string" && secret.length >= 32 &&
    configuredAdminOrigin(process.env.ADMIN_PUBLIC_ORIGIN, production) !== null &&
    authBackendEndpoint(process.env.CURRICULA_API_ORIGIN, production, "request") !== null;
}

export function browserRequestAllowed(request: Request): boolean {
  return validBrowserPost(
    request.headers.get("origin"),
    request.headers.get("sec-fetch-site"),
    process.env.ADMIN_PUBLIC_ORIGIN,
    process.env.NODE_ENV === "production"
  );
}

export async function readLimitedJson(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null;
  if (!request.body) return null;
  const reportedLength = request.headers.get("content-length");
  if (reportedLength !== null && (!/^\d+$/.test(reportedLength) ||
      Number(reportedLength) > MAX_REQUEST_BYTES)) return null;
  const reader = request.body.getReader();
  const pieces: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) { await reader.cancel(); return null; }
      pieces.push(value);
    }
    if (length === 0) return null;
    const combined = new Uint8Array(length);
    let offset = 0;
    for (const piece of pieces) {
      combined.set(piece, offset);
      offset += piece.byteLength;
    }
    const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
    return result !== null && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function callOwnerBackend(
  operation: OwnerAuthOperation,
  body?: Record<string, unknown>,
  bearerToken?: string
): Promise<Response | null> {
  if (!ownerLoginEnabled()) return null;
  const production = process.env.NODE_ENV === "production";
  const url = authBackendEndpoint(process.env.CURRICULA_API_ORIGIN, production, operation);
  const secret = process.env.OWNER_BFF_SHARED_SECRET;
  if (!url || !secret) return null;

  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "X-Admin-BFF-Secret": secret,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
}

export function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}
