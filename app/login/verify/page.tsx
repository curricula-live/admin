import { notFound } from "next/navigation";
import VerifyOwnerLink from "./verify-owner-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Reading the link cannot redeem it; only an explicit client POST can. */
export default function OwnerLinkConfirmationPage() {
  if (process.env.ADMIN_OWNER_LOGIN_ENABLED !== "true") notFound();
  return <VerifyOwnerLink />;
}
