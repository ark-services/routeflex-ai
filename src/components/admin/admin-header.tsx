"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { logout } from "@/app/(auth)/actions";

export function AdminHeader({
  accountName,
  accountId,
}: {
  accountName: string;
  accountId: string;
}) {
  const router = useRouter();

  // Derive initials for the avatar bubble
  const initials = accountName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="h-14 bg-white border-b border-stone-200 flex items-center gap-4 px-5 flex-shrink-0">
      {/* ── Back button ─────────────────────────────── */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

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

      {/* ── User / logout ───────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Avatar bubble */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-white leading-none">{initials}</span>
          </div>
          <span className="hidden sm:block text-sm font-medium text-stone-700 max-w-[160px] truncate">
            {accountName}
          </span>
        </div>

        <div className="w-px h-5 bg-stone-200 flex-shrink-0" />

        {/* Log out */}
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
