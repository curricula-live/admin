import { redirect } from "next/navigation";

// Fail closed until the API-owned owner session and BFF have been implemented.
// Never display an Atlas preview at this route without an actual server check.
export default function Home() {
  redirect("/login");
}
