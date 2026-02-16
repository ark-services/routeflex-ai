"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, Link2 } from "lucide-react";

export function InviteModal({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (emails: string, role: string) => Promise<void>;
}) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emails.trim()) return;

    setLoading(true);
    try {
      await onInvite(emails, role);
      setEmails("");
      setRole("member");
      onClose();
    } catch (error) {
      console.error("Invite error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite to RouteFlex</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Invite Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <Mail className="w-4 h-4" />
              <span>Invite with email</span>
            </div>
            <div className="space-y-3 pl-6">
              <div>
                <label htmlFor="emails" className="block text-xs font-medium text-stone-600 mb-1.5">
                  Email addresses
                </label>
                <input
                  id="emails"
                  type="text"
                  placeholder="email@example.com, another@example.com"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                <p className="text-xs text-stone-500 mt-1">
                  Separate multiple emails with commas
                </p>
              </div>
              <div>
                <label htmlFor="role" className="block text-xs font-medium text-stone-600 mb-1.5">
                  Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
          </div>

          {/* Link Invite Section (Optional) */}
          <div className="space-y-3 border-t border-stone-200 pt-6">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <Link2 className="w-4 h-4" />
              <span>Invite with link</span>
            </div>
            <div className="pl-6">
              <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                <input
                  type="text"
                  value="https://routeflex.ai/invite/..."
                  readOnly
                  className="flex-1 bg-transparent text-sm text-stone-500 focus:outline-none"
                />
                <Button
                  type="button"
                  variant="tertiary"
                  className="text-xs px-3 py-1.5"
                  disabled
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-stone-400 mt-1">
                Coming soon
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="tertiary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={loading || !emails.trim()}
            >
              {loading ? "Sending..." : "Invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
