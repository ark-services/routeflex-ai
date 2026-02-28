"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Zap, Puzzle } from "lucide-react";

const navItems = [
  {
    href: "",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: "/users",
    label: "Users",
    icon: Users,
  },
  {
    href: "/automations",
    label: "Automations",
    icon: Zap,
  },
  {
    href: "/integrations",
    label: "Integrations",
    icon: Puzzle,
  },
];

export function AdminSidebar({ accountId }: { accountId: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    const fullPath = `/admin/${accountId}${href}`;
    return pathname === fullPath;
  };

  return (
    <>
      {/* Mobile: horizontal scrollable tab bar */}
      <div className="md:hidden w-full overflow-x-auto border-b border-white/[0.07] bg-rf-ink-900">
        <nav className="flex min-w-max px-4 gap-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const href = `/admin/${accountId}${item.href}`;

            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap min-h-[44px]
                  ${active
                    ? "bg-[rgba(77,143,255,0.10)] text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-rf-blue-light" : "text-white/30"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop: vertical sidebar */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 bg-rf-ink-900 border-r border-white/[0.07] min-h-[calc(100vh-3.5rem)]">
        <div className="sticky top-0 pt-6 px-3 pb-4">
          <p className="px-3 mb-3 text-[9px] font-bold text-white/25 uppercase tracking-[0.2em]">
            General
          </p>
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const href = `/admin/${accountId}${item.href}`;

              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors
                    ${active
                      ? "bg-[rgba(77,143,255,0.10)] text-white"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-rf-blue-light" : "text-white/30"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
