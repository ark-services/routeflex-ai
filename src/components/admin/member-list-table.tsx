"use client";

import { User } from "lucide-react";

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
  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "member":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "viewer":
        return "bg-stone-50 text-stone-700 border-stone-200";
      default:
        return "bg-stone-50 text-stone-700 border-stone-200";
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-3 px-4 text-xs font-semibold text-stone-600 uppercase tracking-wider">
              Name
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-stone-600 uppercase tracking-wider">
              Email
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-stone-600 uppercase tracking-wider">
              Role
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-stone-600 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors">
              <td className="py-4 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-stone-900">
                    {member.users?.email?.split("@")[0] || "Unknown"}
                  </span>
                </div>
              </td>
              <td className="py-4 px-4 text-sm text-stone-600">
                {member.users?.email || "Unknown"}
              </td>
              <td className="py-4 px-4">
                <select
                  value={member.role}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md border ${getRoleColor(member.role)} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  disabled={member.user_id === currentUserId || currentUserRole !== "admin"}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </td>
              <td className="py-4 px-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  Active
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
