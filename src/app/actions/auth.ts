"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// Forces the Google consent screen so a fresh refresh_token is issued —
// used when the stored one has been revoked or expired.
export async function reconnectGmail() {
  await signIn("google", { redirectTo: "/dashboard" }, { prompt: "consent" });
}
