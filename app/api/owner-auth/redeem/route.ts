import { NextRequest, NextResponse } from "next/server";
import { configuredOwnerAuth, redeemOwnerEmail } from "@/lib/server/owner-auth-service";
import { readBoundedJson, safeOpaqueToken, trustedBrowserPost } from "@/lib/server/owner-auth-policy";
import { OWNER_COOKIE_NAME } from "@/lib/server/session-contract";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/** Explicit one-use POST redemption. Bearer is confined to an HttpOnly host-only cookie. */
export async function POST(request: NextRequest) {
  const config = configuredOwnerAuth();
  if (!config) return new NextResponse(null, { status: 404, headers: HEADERS });
  if (!trustedBrowserPost(request, config))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  const body = await readBoundedJson(request);
  if (!body || !safeOpaqueToken(body.challenge))
    return NextResponse.json({ error: "invalid challenge" }, { status: 401, headers: HEADERS });

  const session = await redeemOwnerEmail(config, body.challenge);
  if (!session) return NextResponse.json({ error: "invalid challenge" },
    { status: 401, headers: HEADERS });

  const response = NextResponse.json({ authenticated: true }, { status: 200, headers: HEADERS });
  response.cookies.set(OWNER_COOKIE_NAME, session.token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: session.maxAge
  });
  return response;
}
