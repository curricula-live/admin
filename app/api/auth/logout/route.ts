import { NextRequest, NextResponse } from "next/server";
import { OWNER_COOKIE_NAME } from "@/lib/server/session-contract";
import { secureOwnerCookieOptions } from "@/lib/server/owner-auth-bff-contract";
import {
  browserRequestAllowed,
  callOwnerBackend,
  noStoreHeaders,
  ownerLoginEnabled,
} from "@/lib/server/owner-auth-bff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!ownerLoginEnabled()) return new Response(null, { status: 404, headers: noStoreHeaders() });
  if (!browserRequestAllowed(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  const token = request.cookies.get(OWNER_COOKIE_NAME)?.value;
  const upstream = token ? await callOwnerBackend("logout", undefined, token) : null;
  // Clear the browser cookie even when Django cannot be reached. A failed
  // upstream revocation must still be reported so it is not mistaken for
  // proof that the session credential was invalidated server-side.
  const successful = !token || upstream?.status === 204;
  const response = successful
    ? new NextResponse(null, { status: 204, headers: noStoreHeaders() })
    : NextResponse.json({ error: "session revocation unavailable" }, {
        status: 503, headers: noStoreHeaders(),
      });

  response.cookies.set(OWNER_COOKIE_NAME, "", secureOwnerCookieOptions(new Date(0)));
  return response;
}
