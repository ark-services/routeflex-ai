"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Zap, Puzzle } from "lucide-react";

const navItems = [
  {
    href: "",
    label: "Overview",
    icon: LayoutDashboard
  },
  {
    href: "/users",
    label: "Users",
    icon: Users
  },
  {
    href: "/automations",
    label: "Automations",
    icon: Zap
  },
  {
    href: "/integrations",
    label: "Integrations",
    icon: Puzzle
  },
];

export function AdminSidebar({ accountId }: { accountId: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    const fullPath = `/admin/${accountId}${href}`;
    return pathname === fullPath;
  };

  return (
    <aside className="w-56 flex-shrink-0">
      <div className="sticky top-6 space-y-1">
        <h2 className="px-3 mb-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">
          Admin Center
        </h2>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const href = `/admin/${accountId}${item.href}`;

            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? "bg-blue-50 text-blue-700"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
