import { createClient } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <strong>{user?.email}</strong>
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="rounded bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Log out
          </button>
        </form>
      </main>
    </div>
  );
}
