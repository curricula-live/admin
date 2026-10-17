import { NextRequest, NextResponse } from "next/server";
import { currentOwnerIdentity } from "@/lib/server/owner-session";
import { atlasAccessDecision } from "@/lib/server/owner-access-policy";
import { readPublicConceptDetail } from "@/lib/server/public-atlas";

export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest, context: {params: Promise<{id:string}>}) {
  const identity = await currentOwnerIdentity();
  if (atlasAccessDecision(process.env.ADMIN_OWNER_PREVIEW_ENABLED === "true", identity) !== "owner")
    return NextResponse.json({error:"Owner session required"},{status:401,headers:{"Cache-Control":"no-store"}});
  try {
    const {id} = await context.params;
    const detail = await readPublicConceptDetail(id);
    return NextResponse.json(detail,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message : "Knowledge unavailable"},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
