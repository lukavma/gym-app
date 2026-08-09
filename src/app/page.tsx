import { redirect } from "next/navigation";

// Middleware requires a session for every non-public path, including this
// one, so reaching this component means the request is authenticated.
export default function RootPage() {
  redirect("/today");
}
