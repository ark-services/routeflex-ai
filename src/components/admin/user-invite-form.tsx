"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UserInviteForm({ accountId, disabled }: { accountId: string; disabled: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");

  return (
    <form className="flex gap-3">
      <input
        type="email"
        placeholder="email@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        disabled={disabled}
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as "admin" | "member" | "viewer")}
        className="rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        disabled={disabled}
      >
        <option value="admin">Admin</option>
        <option value="member">Member</option>
        <option value="viewer">Viewer</option>
      </select>
      <Button type="submit" disabled={disabled}>
        Send Invite
      </Button>
    </form>
  );
}
