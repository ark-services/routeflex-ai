"use client";

export function MemberListTable({
  members,
  accountId,
  currentUserId,
  currentUserRole,
}: {
  members: any[];
  accountId: string;
  currentUserId: string;
  currentUserRole: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-stone-200/60">
            <th className="text-left py-3 px-4 text-xs font-medium text-stone-500 uppercase tracking-wide">Email</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-stone-500 uppercase tracking-wide">Role</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-stone-500 uppercase tracking-wide">Joined</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-stone-500 uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-stone-100 last:border-0">
              <td className="py-3 px-4 text-sm text-stone-900">{member.users?.email || "Unknown"}</td>
              <td className="py-3 px-4 text-sm">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-stone-100 text-stone-800">
                  {member.role}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-stone-500">
                {new Date(member.created_at).toLocaleDateString()}
              </td>
              <td className="py-3 px-4 text-right text-sm">
                {member.user_id === currentUserId ? (
                  <span className="text-stone-400">You</span>
                ) : (
                  <button className="text-red-600 hover:text-red-700 disabled:opacity-50" disabled={currentUserRole !== "admin"}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
