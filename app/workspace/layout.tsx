import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

/** Server-side session check for every /workspace route (validated against the DB). */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
