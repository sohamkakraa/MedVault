import { redirect } from "next/navigation";

/** The /body route has been removed. Redirect visitors to the dashboard. */
export default function BodyPage() {
  redirect("/dashboard");
}
