import Link from "next/link";

export function HelpCenterFooter() {
  return (
    <footer className="border-t border-rf-border bg-rf-surface-card">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-rf-text-muted">
          &copy; {new Date().getFullYear()} RouteFlex. All rights reserved.
        </p>
        <div className="flex items-center gap-6">
          <Link
            href="/help-center"
            className="text-sm text-rf-text-muted hover:text-rf-text-secondary transition-colors"
          >
            Help Center
          </Link>
          <Link
            href="/help-center/tickets"
            className="text-sm text-rf-text-muted hover:text-rf-text-secondary transition-colors"
          >
            Submit a Ticket
          </Link>
          <Link
            href="/contact"
            className="text-sm text-rf-text-muted hover:text-rf-text-secondary transition-colors"
          >
            Contact Us
          </Link>
          <Link
            href="/privacy"
            className="text-sm text-rf-text-muted hover:text-rf-text-secondary transition-colors"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
