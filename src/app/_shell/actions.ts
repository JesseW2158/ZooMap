"use server";

import { signOut } from "@/modules/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
