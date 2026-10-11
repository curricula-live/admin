import { NextResponse } from "next/server";
import { OWNER_COOKIE_NAME } from "@/lib/server/session-contract";
import { isValidChallenge, parseIssuedSession, secureOwnerCookieOptions, verifiedOwnerCookieExpiry } from "@/lib/server/owner-auth-bff-contract";
import { verifyOwnerSession } from "@/lib/server/session-contract";
import {
  browserRequestAllowed,
  callOwnerBackend,
  noStoreHeaders,
  ownerLoginEnabled,
  readLimitedJson,
} from "@/lib/server/owner-auth-bff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!ownerLoginEnabled()) return new Response(null, { status: 404, headers: noStoreHeaders() });
  if (!browserRequestAllowed(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStoreHeaders() });
  }
  const body = await readLimitedJson(request);
  if (!body || !isValidChallenge(body.challenge)) {
    return NextResponse.json({ error: "invalid challenge" }, {
      status: 400, headers: noStoreHeaders(),
    });
  }

  const upstream = await callOwnerBackend("redeem", { challenge: body.challenge });
  if (!upstream) {
    return NextResponse.json({ error: "temporarily unavailable" }, {
      status: 503, headers: noStoreHeaders(),
    });
  }
  if (upstream.status === 401) {
    return NextResponse.json({ error: "expired or used link" }, {
      status: 401, headers: noStoreHeaders(),
    });
  }
  if (upstream.status !== 200) {
    return NextResponse.json({ error: "temporarily unavailable" }, {
      status: 503, headers: noStoreHeaders(),
    });
  }

  let raw: unknown;
  try {
    raw = await upstream.json();
  } catch {
    return NextResponse.json({ error: "temporarily unavailable" }, {
      status: 503, headers: noStoreHeaders(),
    });
  }
  const session = parseIssuedSession(raw);
  if (!session) {
    return NextResponse.json({ error: "temporarily unavailable" }, {
      status: 503, headers: noStoreHeaders(),
    });
  }

  const attested = await verifyOwnerSession(
    session.token, process.env.CURRICULA_API_ORIGIN,
    process.env.NODE_ENV === "production", fetch
  );
  const attestedExpiry = verifiedOwnerCookieExpiry(session, attested);
  if (!attestedExpiry) {
    // Never install an unverified credential. Best-effort revoke the orphan session.
    await callOwnerBackend("logout", undefined, session.token);
    return NextResponse.json({ error: "temporarily unavailable" }, {
      status: 503, headers: noStoreHeaders(),
    });
  }

  // The API's bearer token is NEVER serialized in this browser response.
  const response = NextResponse.json({ authenticated: true }, {
    status: 200, headers: noStoreHeaders(),
  });
  response.cookies.set(OWNER_COOKIE_NAME, session.token, secureOwnerCookieOptions(attestedExpiry));
  return response;
}
