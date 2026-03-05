import { redirect } from "next/navigation";

// Middleware handles / → /trades (authed) or /market (guest) before this runs.
// This is a fallback only.
export default function HomePage(): never {
  redirect("/market");
}
