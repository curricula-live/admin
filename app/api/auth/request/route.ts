import { NextResponse } from "next/server";
import {
  browserRequestAllowed,
  callOwnerBackend,
  noStoreHeaders,
  ownerLoginEnabled,
  readLimitedJson,
} from "@/lib/server/owner-auth-bff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEUTRAL = { message: "If an eligible account exists, a sign-in email will be sent." };

export async function POST(request: Request) {
  if (!ownerLoginEnabled()) return new Response(null, { status: 404, headers: noStoreHeaders() });
  if (!browserRequestAllowed(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStoreHeaders() });
  }
  const body = await readLimitedJson(request);
  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400, headers: noStoreHeaders() });
  }

  // Neither the source IP nor the email's owner status is exposed to the browser.
  const upstream = await callOwnerBackend("request", { email: body.email });
  if (!upstream || upstream.status !== 202) {
    return NextResponse.json({ error: "temporarily unavailable" }, {
      status: 503, headers: noStoreHeaders()
    });
  }
  return NextResponse.json(NEUTRAL, { status: 202, headers: noStoreHeaders() });
}
