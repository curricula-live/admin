import { notFound } from "next/navigation";
import VerifyOwnerLink from "./verify-owner-link";
import { ownerAuthStageEnabled } from "@/lib/server/owner-auth-bff-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Reading the link cannot redeem it; only an explicit client POST can. */
export default function OwnerLinkConfirmationPage() {
  if (!ownerAuthStageEnabled(process.env.APP_ENV, process.env.ADMIN_OWNER_LOGIN_ENABLED)) notFound();
  return <VerifyOwnerLink />;
}
