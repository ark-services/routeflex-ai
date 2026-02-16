import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  // In newer Next.js versions, `cookies()` can be async and returns a Promise.
  const cookieStore = await cookies();

  // Debug Supabase environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseUrlAlt = process.env.SUPABASE_URL || "";
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "unknown";
  console.log("DEBUG: Supabase environment:", {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_URL: supabaseUrlAlt,
    projectRef,
  });

  const allCookies = cookieStore.getAll();
  console.log("DEBUG: Cookies exist:", allCookies.length > 0);
  console.log(
    "DEBUG: Cookie names:",
    allCookies.map((c) => c.name).join(", ")
  );

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

  // Debug: Check auth immediately after client creation
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  console.log("DEBUG: getUser() result:", {
    userId: user?.id || null,
    email: user?.email || null,
    error: error?.message || null,
  });

  return client;
}
