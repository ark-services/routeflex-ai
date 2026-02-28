"use client";

import { useState, useMemo, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberListTable } from "@/components/admin/member-list-table";
import { InviteModal } from "@/components/admin/invite-modal";
import { Toast } from "@/components/ui/toast";
import { Search, UserPlus } from "lucide-react";
import {
  getOrCreateInviteLink,
  regenerateInviteLink,
  sendEmailInvites,
} from "@/app/admin/[accountId]/users/actions";

export function UsersPageClient({
  accountId,
  members,
  currentUserId,
  currentUserRole,
  canInviteMore,
  memberCount,
  maxSeats,
  initialInviteLinkToken,
}: {
  accountId: string;
  members: any[];
  currentUserId: string;
  currentUserRole: string;
  canInviteMore: boolean;
  memberCount: number;
  maxSeats: number;
  initialInviteLinkToken: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Invite link state — seeded from server, updated client-side
  const [inviteLinkToken, setInviteLinkToken] = useState<string | null>(
    initialInviteLinkToken
  );
  const [isLoadingLink, setIsLoadingLink] = useState(false);
  const [isPending, startTransition] = useTransition();

  const inviteLink = inviteLinkToken
    ? `${typeof window !== "undefined" ? window.location.origin : "https://routeflex.ai"}/invite/${inviteLinkToken}`
    : null;

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const query = searchQuery.toLowerCase();
    return members.filter((member) => {
      const email = member.users?.email?.toLowerCase() || "";
      return email.includes(query) || email.split("@")[0].includes(query);
    });
  }, [members, searchQuery]);

  const handleOpenInviteModal = async () => {
    setShowInviteModal(true);
    // Load / create the invite link if we don't have one yet
    if (!inviteLinkToken) {
      setIsLoadingLink(true);
      try {
        const { token } = await getOrCreateInviteLink(accountId);
        setInviteLinkToken(token);
      } finally {
        setIsLoadingLink(false);
      }
    }
  };

  const handleRegenerate = async (role: string) => {
    setIsLoadingLink(true);
    try {
      const { token } = await regenerateInviteLink(accountId, role);
      setInviteLinkToken(token);
    } finally {
      setIsLoadingLink(false);
    }
  };

  const handleInvite = async (emails: string, role: string) => {
    const { results } = await sendEmailInvites(accountId, emails, role);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      setToast({
        message: `Some invites failed: ${failed.map((f) => f.email).join(", ")}`,
        type: "error",
      });
    } else {
      setToast({ message: "Invitation(s) sent!", type: "success" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-rf-text-primary">
            User management
          </h1>
          <p className="text-sm text-rf-text-secondary mt-1">
            {memberCount} / {maxSeats} seats used
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleOpenInviteModal}
          disabled={!canInviteMore}
          className="gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite
        </Button>
      </div>

      {/* Seat limit warning */}
      {!canInviteMore && (
        <Card className="p-4 bg-rf-warning-bg border-amber-200">
          <p className="text-sm text-rf-warning font-medium">
            Seat limit reached ({memberCount} / {maxSeats})
          </p>
          <p className="text-xs text-rf-warning mt-1">
            Upgrade your plan to invite more team members
          </p>
        </Card>
      )}

      {/* Search and Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-rf-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rf-text-muted" />
            <input
              type="text"
              placeholder="Search user name / email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-rf-border rounded-lg focus:outline-none focus:ring-2 focus:ring-rf-blue focus:border-transparent"
            />
          </div>
        </div>
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
              <p className="text-sm text-rf-text-secondary">
                {searchQuery
                  ? "No users found matching your search"
                  : "No team members yet"}
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
        inviteLink={inviteLink}
        isLoadingLink={isLoadingLink}
        onRegenerateLink={handleRegenerate}
      />

      {/* Toast */}
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
