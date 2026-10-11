import { NextRequest, NextResponse } from "next/server";
import { configuredOwnerAuth, requestOwnerEmail } from "@/lib/server/owner-auth-service";
import { NEUTRAL_REQUEST_RESPONSE, readBoundedJson,
  safeEmail, trustedBrowserPost } from "@/lib/server/owner-auth-policy";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/** Never allow browser calls to the Django API or reveal whether an owner exists. */
export async function POST(request: NextRequest) {
  const config = configuredOwnerAuth();
  if (!config) return new NextResponse(null, { status: 404, headers: HEADERS });
  if (!trustedBrowserPost(request, config))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  const body = await readBoundedJson(request);
  if (!body) return NextResponse.json({ error: "invalid request" }, { status: 400, headers: HEADERS });
  const email = safeEmail(body.email);
  if (email) await requestOwnerEmail(config, email);
  return NextResponse.json(NEUTRAL_REQUEST_RESPONSE, { status: 202, headers: HEADERS });
}
