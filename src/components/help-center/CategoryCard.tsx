import Link from "next/link";
import {
  BookOpen,
  Rocket,
  Users,
  Settings,
  Zap,
  HelpCircle,
  LayoutDashboard,
  ClipboardList,
  Bot,
  Shield,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import type { HelpCategory } from "@/lib/help-center/types";

const iconMap: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  rocket: Rocket,
  users: Users,
  settings: Settings,
  zap: Zap,
  "help-circle": HelpCircle,
  "layout-dashboard": LayoutDashboard,
  "clipboard-list": ClipboardList,
  bot: Bot,
  shield: Shield,
  "credit-card": CreditCard,
};

export function CategoryCard({ category }: { category: HelpCategory }) {
  const Icon = iconMap[category.icon ?? ""] ?? BookOpen;

  return (
    <Link
      href={`/help-center/${category.slug}`}
      className="group flex flex-col gap-3 p-6 bg-rf-surface-card border border-rf-border rounded-rf-xl hover:border-rf-blue/40 hover:shadow-rf-md transition-all"
    >
      <div className="h-10 w-10 rounded-rf-lg bg-rf-blue/10 flex items-center justify-center group-hover:bg-rf-blue/20 transition-colors">
        <Icon className="h-5 w-5 text-rf-blue" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-rf-text-primary group-hover:text-rf-blue transition-colors">
          {category.title}
        </h3>
        {category.description && (
          <p className="mt-1 text-xs text-rf-text-muted line-clamp-2">
            {category.description}
          </p>
        )}
      </div>
      {typeof category.article_count === "number" && (
        <span className="text-xs text-rf-text-muted mt-auto">
          {category.article_count} {category.article_count === 1 ? "article" : "articles"}
        </span>
      )}
    </Link>
  );
}
