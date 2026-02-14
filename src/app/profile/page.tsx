import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            My Profile
          </h1>
          <p className="mt-2 text-stone-500">Manage your account settings</p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Email
            </label>
            <p className="text-stone-900">{user.email}</p>
          </div>

          <div className="pt-4 border-t border-stone-200">
            <p className="text-sm text-stone-500">
              Profile management features coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
