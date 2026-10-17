import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.APP_ENV !== "staging") {
    return new Response(null, {status:404});
  }
  const origin = process.env.CURRICULA_API_ORIGIN;
  const secret = process.env.OWNER_BFF_SHARED_SECRET;
  const bypass = process.env.API_VERCEL_BYPASS_SECRET;
  if (origin !== "https://curricula-live-api-git-dev-dbxdrgsls-projects.vercel.app" ||
      !secret || secret.length < 32 || !bypass || bypass.length < 24) {
    return NextResponse.json({status:"unconfigured"},{status:503,headers:{"Cache-Control":"private, no-store"}});
  }
  try {
    const response = await fetch(origin + "/internal/staging-db-health/", {
      headers:{"X-Admin-BFF-Secret":secret,"x-vercel-protection-bypass":bypass,Accept:"application/json"},
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
    });
    const value = await response.json();
    // Return only explicitly allowed booleans and a bounded exception class.
    const obj = typeof value === "object" && value !== null ? value as Record<string,unknown> : {};
    return NextResponse.json({
      upstream_status:response.status,
      connectivity:obj.connectivity === true,
      knowledge_read:obj.knowledge_read === true,
      owner_read:obj.owner_read === true,
      rate_bucket_write:obj.rate_bucket_write === true,
      failure_category:typeof obj.failure_category==="string" && /^[A-Za-z]{1,40}$/.test(obj.failure_category)?obj.failure_category:null,
      failure_kind:typeof obj.failure_kind==="string" && /^[a-z_]{1,40}$/.test(obj.failure_kind)?obj.failure_kind:null
    },{status:200,headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({status:"upstream_unreachable"},{status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
