"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";
import { WaitlistButton } from "@/components/marketing/WaitlistButton";

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Help Center", href: "/help-center" },
  { label: "Contact", href: "/contact" },
];

export function MarketingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-rf-surface-card/95 backdrop-blur-md border-b border-rf-border shadow-rf-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between h-[72px]">
        {/* Logo */}
        <Link href="/" className="relative z-10">
          <RouteFlexLogo size="nav" />
        </Link>

        {/* Desktop nav — centered */}
        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary transition-colors px-4 py-2 rounded-rf-md hover:bg-rf-ink-100/50"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-2 relative z-10">
          <Link
            href="/login"
            className="text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary transition-colors px-4 py-2 rounded-rf-md hover:bg-rf-ink-100/50"
          >
            Log in
          </Link>
          <WaitlistButton className="text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark px-5 py-2.5 rounded-rf-lg transition-all shadow-rf-sm hover:shadow-rf-md">
            Get Early Access
          </WaitlistButton>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-rf-text-secondary hover:text-rf-text-primary transition-colors relative z-10"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-rf-surface-card border-b border-rf-border px-6 pb-6 pt-2 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block py-2.5 text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 space-y-2">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="block text-center text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary py-2.5 border border-rf-border rounded-rf-md transition-colors"
            >
              Log in
            </Link>
            <WaitlistButton
              className="block w-full text-center text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark py-2.5 rounded-rf-md transition-colors"
            >
              Get Early Access
            </WaitlistButton>
          </div>
        </div>
      )}
    </nav>
  );
}
