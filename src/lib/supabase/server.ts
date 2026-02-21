import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  // In newer Next.js versions, `cookies()` can be async and returns a Promise.
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // `cookies()` is read-only in Server Components; this will work in Route Handlers / Server Actions.
              (cookieStore as any).set(name, value, options);
            });
          } catch {
            // Server Components can't set cookies.
            // This will still work in Route Handlers / Server Actions.
          }
        },
      },
    }
  );

  return client;
}
