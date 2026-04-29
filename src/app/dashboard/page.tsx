import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/app/actions/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center bg-white px-6 py-24 text-zinc-900 dark:bg-[#0a0a0f] dark:text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Connected
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          You&apos;re signed in.
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {session.user.email}
          </span>
        </p>

        {session.error === "RefreshAccessTokenError" && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Your Gmail connection expired — please sign in again.
          </p>
        )}

        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
