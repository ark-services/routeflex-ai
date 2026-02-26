"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
    <header className="h-14 bg-white border-b border-stone-200 flex items-center gap-4 px-5 flex-shrink-0">
      {/* ── Back / Exit to Job Board ─────────────────── */}
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Divider */}
      <div className="w-px h-5 bg-stone-200 flex-shrink-0" />

      {/* ── Branding ────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="text-sm font-bold text-stone-900 hover:opacity-75 transition-opacity tracking-tight"
        >
          RouteFlex AI
        </Link>
        <span className="text-stone-300 text-sm">·</span>
        <span className="text-sm font-medium text-stone-500">Admin Center</span>
      </div>

      {/* ── Spacer ──────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Avatar + account name + logout ──────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block text-sm font-medium text-stone-700 max-w-[160px] truncate">
            {accountName}
          </span>
        </div>

        <div className="w-px h-5 bg-stone-200 flex-shrink-0" />

        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
