import { redirect } from "next/navigation";

/**
 * Allowances used to live at two addresses with two different implementations.
 * This one keeps working for anyone holding a link or a bookmark.
 */
export default function DashboardAllowancesRoute() {
  redirect("/allowances");
}
