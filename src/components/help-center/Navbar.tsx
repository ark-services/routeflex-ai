"use client";

import Link from "next/link";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";
import { Search, Menu, X } from "lucide-react";
import { useState } from "react";

export function HelpCenterNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-rf-surface-card/95 backdrop-blur-md border-b border-rf-border">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-[64px]">
        <div className="flex items-center gap-3">
          <Link href="/">
            <RouteFlexLogo size="nav" />
          </Link>
          <span className="text-rf-text-muted text-sm">/</span>
          <Link
            href="/help-center"
            className="text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary transition-colors"
          >
            Help Center
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/help-center#search"
            className="flex items-center gap-2 text-sm text-rf-text-muted hover:text-rf-text-secondary transition-colors"
          >
            <Search className="h-4 w-4" />
            Search docs
          </Link>
          <Link
            href="/help-center/tickets"
            className="text-sm font-medium text-rf-blue hover:text-rf-blue-dark transition-colors"
          >
            Submit a Ticket
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary transition-colors px-3 py-1.5 rounded-rf-md hover:bg-rf-ink-100/50"
          >
            Log in
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-rf-text-secondary"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-rf-border px-6 pb-4 pt-2 space-y-2 bg-rf-surface-card">
          <Link
            href="/help-center#search"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm text-rf-text-secondary"
          >
            Search docs
          </Link>
          <Link
            href="/help-center/tickets"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-rf-blue"
          >
            Submit a Ticket
          </Link>
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm text-rf-text-secondary"
          >
            Log in
          </Link>
        </div>
      )}
    </nav>
  );
}
