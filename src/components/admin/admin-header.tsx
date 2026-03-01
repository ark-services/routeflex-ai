"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";

export function AdminHeader({
  accountName,
  accountId,
  userEmail,
  backHref,
}: {
  accountName: string;
  accountId: string;
  userEmail: string;
  backHref: string;
}) {
  // Same initials logic as UserMenu on the dashboard
  const initials = userEmail
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-14 bg-rf-surface-card border-b border-rf-border flex items-center gap-4 px-5 flex-shrink-0">
      {/* ── Back / Exit to Job Board ─────────────────── */}
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-sm font-medium text-rf-text-secondary hover:text-rf-text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Divider */}
      <div className="w-px h-5 bg-rf-ink-100 flex-shrink-0" />

      {/* ── Branding ────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="hover:opacity-75 transition-opacity">
          <RouteFlexLogo size="nav" />
        </Link>
        <span className="text-rf-text-muted text-sm">·</span>
        <span className="text-sm font-medium text-rf-text-secondary">Admin Center</span>
      </div>

      {/* ── Spacer ──────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Avatar + account name + logout ──────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block text-sm font-medium text-rf-ink-700 max-w-[160px] truncate">
            {accountName}
          </span>
        </div>

        <div className="w-px h-5 bg-rf-ink-100 flex-shrink-0" />

        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-rf-text-secondary hover:text-rf-text-primary transition-colors"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
