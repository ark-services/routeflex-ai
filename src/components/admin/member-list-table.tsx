"use client";

import { useState, useTransition } from "react";
import { User } from "lucide-react";
import { changeMemberRole, removeMember } from "@/app/admin/[accountId]/users/member-actions";

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
  const [isPending, startTransition] = useTransition();
  const [localRoles, setLocalRoles] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.id, m.role]))
  );

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "bg-rf-blue-tint text-rf-blue border-rf-blue";
      case "member":
        return "bg-rf-blue-tint text-rf-blue border-rf-blue-tint";
      case "viewer":
        return "bg-rf-surface-page text-rf-ink-700 border-rf-border";
      default:
        return "bg-rf-surface-page text-rf-ink-700 border-rf-border";
    }
  };

  const handleRoleChange = (membershipId: string, newRole: string) => {
    setLocalRoles((prev) => ({ ...prev, [membershipId]: newRole }));
    startTransition(async () => {
      await changeMemberRole(accountId, membershipId, newRole);
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-rf-border">
            <th className="text-left py-3 px-4 text-xs font-semibold text-rf-ink-500 uppercase tracking-wider">
              Name
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-rf-ink-500 uppercase tracking-wider">
              Email
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-rf-ink-500 uppercase tracking-wider">
              Role
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-rf-ink-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const canEdit = currentUserRole === "admin" && !isSelf;
            const role = localRoles[member.id] ?? member.role;

            return (
              <tr
                key={member.id}
                className="border-b border-rf-ink-100 last:border-0 hover:bg-rf-surface-page/50 transition-colors"
              >
                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rf-blue to-rf-blue-dark flex items-center justify-center text-white text-sm font-medium">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-rf-text-primary">
                      {member.users?.email?.split("@")[0] || "Unknown"}
                      {isSelf && (
                        <span className="ml-2 text-xs text-rf-text-muted">(you)</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-4 text-sm text-rf-ink-500">
                  {member.users?.email || "Unknown"}
                </td>
                <td className="py-4 px-4">
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={!canEdit || isPending}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md border ${getRoleColor(role)} focus:outline-none focus:ring-2 focus:ring-rf-blue disabled:opacity-70 disabled:cursor-default`}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="py-4 px-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-rf-success-bg text-rf-success border border-green-200">
                    Active
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
