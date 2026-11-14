import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/auth";
import { AppShell } from "./_shell/AppShell";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return <AppShell user={{ name: user.name ?? null, email: user.email }} />;
}
