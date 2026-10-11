import { NextRequest, NextResponse } from "next/server";
import { configuredOwnerAuth, revokeOwnerSession } from "@/lib/server/owner-auth-service";
import { trustedBrowserPost } from "@/lib/server/owner-auth-policy";
import { OWNER_COOKIE_NAME } from "@/lib/server/session-contract";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/** Browser cookie is always cleared; remote revocation failure is reported. */
export async function POST(request: NextRequest) {
  const config = configuredOwnerAuth();
  if (!config) return new NextResponse(null, { status: 404, headers: HEADERS });
  if (!trustedBrowserPost(request, config))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  const token = request.cookies.get(OWNER_COOKIE_NAME)?.value;
  const revoked = !token || await revokeOwnerSession(config, token);
  const response = new NextResponse(null, { status: revoked ? 204 : 503, headers: HEADERS });
  response.cookies.set(OWNER_COOKIE_NAME, "", {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0
  });
  return response;
}
