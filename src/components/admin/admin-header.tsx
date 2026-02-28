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
    <header className="h-14 bg-rf-ink-900 border-b border-white/[0.07] flex items-center gap-4 px-5 flex-shrink-0">
      {/* ── Back / Exit to Job Board ─────────────────── */}
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-sm font-medium text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Divider */}
      <div className="w-px h-5 bg-white/[0.10] flex-shrink-0" />

      {/* ── Branding ────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div data-theme="dark">
          <Link href="/" className="hover:opacity-75 transition-opacity">
            <RouteFlexLogo size="nav" />
          </Link>
        </div>
        <span className="text-white/25 text-sm">·</span>
        <span className="text-sm font-medium text-white/50">Admin Center</span>
      </div>

      {/* ── Spacer ──────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Avatar + account name + logout ──────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block text-sm font-medium text-white/70 max-w-[160px] truncate">
            {accountName}
          </span>
        </div>

        <div className="w-px h-5 bg-white/[0.10] flex-shrink-0" />

        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
