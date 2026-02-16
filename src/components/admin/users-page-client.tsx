"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberListTable } from "@/components/admin/member-list-table";
import { InviteModal } from "@/components/admin/invite-modal";
import { Toast } from "@/components/ui/toast";
import { Search, UserPlus } from "lucide-react";

export function UsersPageClient({
  accountId,
  members,
  currentUserId,
  currentUserRole,
  canInviteMore,
  memberCount,
  maxSeats,
}: {
  accountId: string;
  members: any[];
  currentUserId: string;
  currentUserRole: string;
  canInviteMore: boolean;
  memberCount: number;
  maxSeats: number;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;

    const query = searchQuery.toLowerCase();
    return members.filter((member) => {
      const email = member.users?.email?.toLowerCase() || "";
      const name = email.split("@")[0];
      return email.includes(query) || name.includes(query);
    });
  }, [members, searchQuery]);

  const handleInvite = async (emails: string, role: string) => {
    // TODO: Implement actual invite API call
    console.log("Inviting:", { emails, role, accountId });

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    setToast({ message: "Invitation sent", type: "success" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            User management
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {memberCount} / {maxSeats} seats used
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowInviteModal(true)}
          disabled={!canInviteMore}
          className="gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite
        </Button>
      </div>

      {/* Seat limit warning */}
      {!canInviteMore && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800 font-medium">
            Seat limit reached ({memberCount} / {maxSeats})
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Upgrade your plan to invite more team members
          </p>
        </Card>
      )}

      {/* Search and Table Card */}
      <Card className="overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-stone-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search user name / email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Table */}
        <div className="p-6">
          {filteredMembers.length > 0 ? (
            <MemberListTable
              members={filteredMembers}
              accountId={accountId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-stone-500">
                {searchQuery ? "No users found matching your search" : "No team members yet"}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Invite Modal */}
      <InviteModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvite={handleInvite}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
