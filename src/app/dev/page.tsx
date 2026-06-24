import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DevTools } from "./dev-tools";

export default async function DevPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dev Tools</h1>
      <DevTools />
    </main>
  );
}
