import { createServiceClient } from "@/lib/supabase/service";

export default async function SuperAdminWaitlistPage() {
  const svc = createServiceClient();

  const { data: signups } = await svc
    .from("waitlist_signups")
    .select("id, email, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-rf-text-primary">
            Waitlist
          </h1>
          <p className="text-sm text-rf-text-secondary mt-1">
            {signups?.length ?? 0} email
            {signups?.length !== 1 ? "s" : ""} signed up
          </p>
        </div>
      </div>

      <div className="rounded-rf-xl border border-rf-border bg-rf-surface-card overflow-hidden">
        {!signups || signups.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-rf-text-muted">
            No signups yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rf-border bg-rf-surface-page">
                <th className="text-left px-5 py-3 text-xs font-semibold text-rf-text-muted uppercase tracking-wider">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-rf-text-muted uppercase tracking-wider">
                  Signed Up
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rf-border">
              {signups.map((row) => (
                <tr key={row.id} className="hover:bg-rf-surface-page transition-colors">
                  <td className="px-5 py-3 font-medium text-rf-text-primary">
                    {row.email}
                  </td>
                  <td className="px-5 py-3 text-rf-text-secondary font-mono text-xs">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
