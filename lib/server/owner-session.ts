/** Server Component and BFF helper; do not import from client code. */
import { cookies } from "next/headers";
import { OWNER_COOKIE_NAME, verifyOwnerSession } from "./session-contract";

export async function currentOwnerIdentity() {
  const token = (await cookies()).get(OWNER_COOKIE_NAME)?.value;
  // No stubbed success: until API01 serves the verified session contract, null.
  return verifyOwnerSession(
    token,
    process.env.CURRICULA_API_ORIGIN,
    process.env.NODE_ENV === "production",
    fetch
  );
}
