"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Search,
  CheckCheck,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  getNotifications,
  markAllRead,
  markNotificationRead,
  deleteAllNotifications,
  type NotificationItem,
} from "./actions";

interface Props {
  companyId: string;
  accountId: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getDateGroup(dateStr: string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(dateStr);
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (notifDay.getTime() === today.getTime()) return "Today";
  if (notifDay.getTime() === yesterday.getTime()) return "Yesterday";
  const diffDays = Math.floor((today.getTime() - notifDay.getTime()) / 86_400_000);
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Older";
}

const DATE_GROUP_ORDER = ["Today", "Yesterday", "This week", "This month", "Older"];

function TypeIcon({ type }: { type: NotificationItem["type"] }) {
  if (type === "error")
    return <AlertCircle className="w-[18px] h-[18px] text-rf-danger shrink-0" />;
  if (type === "alert")
    return <AlertTriangle className="w-[18px] h-[18px] text-amber-500 shrink-0" />;
  return <Info className="w-[18px] h-[18px] text-rf-blue shrink-0" />;
}

function actionUrl(
  item: NotificationItem,
  companyId: string,
  accountId: string
): string | null {
  const source = item.metadata?.source as string | undefined;
  if (source === "gmail.missing_read_scope") {
    return `/admin/${accountId}/companies/${companyId}/integrations`;
  }
  return null;
}

type Tab = "all" | "unread";

export function NotificationBell({ companyId, accountId }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchNotifications = useCallback(async () => {
    const result = await getNotifications(companyId);
    setItems(result.items);
    setUnreadCount(result.unreadCount);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = () => {
    setOpen((prev) => !prev);
    setKebabOpen(false);
  };

  const handleDeleteAll = async () => {
    await deleteAllNotifications(companyId);
    setItems([]);
    setUnreadCount(0);
    setKebabOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllRead(companyId);
    setItems((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  const handleMarkRead = async (id: string) => {
    const notif = items.find((n) => n.id === id);
    if (!notif || notif.read_at) return;
    await markNotificationRead(id, companyId);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  // Filtered list
  const filtered = useMemo(() => {
    let result = items;
    if (tab === "unread" || unreadOnly) {
      result = result.filter((n) => !n.read_at);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.body && n.body.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, tab, unreadOnly, search]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, NotificationItem[]> = {};
    for (const item of filtered) {
      const g = getDateGroup(item.created_at);
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    }
    const order = DATE_GROUP_ORDER.filter((g) => groups[g]);
    return { groups, order };
  }, [filtered]);

  const isEmpty = grouped.order.length === 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={`relative p-2 rounded-lg transition-colors ${
          open
            ? "bg-rf-blue/10 text-rf-blue"
            : "text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
        }`}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center bg-rf-danger text-white text-[9px] font-bold rounded-full leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[460px] bg-rf-surface-card rounded-xl shadow-rf-xl border border-rf-border flex flex-col overflow-hidden max-h-[calc(100vh-80px)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-rf-border shrink-0">
            <span className="text-[15px] font-semibold text-rf-text-primary">
              Notifications
            </span>
            <div className="flex items-center gap-0.5">
              {/* Kebab menu */}
              <div className="relative">
                <button
                  onClick={() => setKebabOpen((prev) => !prev)}
                  className={`p-1.5 rounded-md transition-colors ${
                    kebabOpen
                      ? "bg-rf-surface-page text-rf-text-secondary"
                      : "text-rf-ink-400 hover:text-rf-text-secondary hover:bg-rf-surface-page"
                  }`}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {kebabOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-rf-surface-card rounded-lg shadow-rf-xl border border-rf-border z-60 py-1 overflow-hidden">
                    <button
                      onClick={() => {
                        handleMarkAllRead();
                        setKebabOpen(false);
                      }}
                      disabled={unreadCount === 0}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rf-text-primary hover:bg-rf-surface-page transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckCheck className="w-4 h-4 text-rf-ink-400" />
                      Mark all as read
                    </button>
                    <button
                      onClick={handleDeleteAll}
                      disabled={items.length === 0}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rf-danger hover:bg-rf-surface-page transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete all
                    </button>
                  </div>
                )}
              </div>
              <div className="w-px h-4 bg-rf-border mx-1" />
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-rf-ink-400 hover:text-rf-text-secondary hover:bg-rf-surface-page transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center px-4 border-b border-rf-border shrink-0">
            {(["all", "unread"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                  tab === t
                    ? "border-rf-blue text-rf-blue"
                    : "border-transparent text-rf-text-secondary hover:text-rf-text-primary"
                }`}
              >
                {t === "all" ? "All" : "Unread"}
                {t === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 bg-rf-blue/10 text-rf-blue text-[10px] font-semibold rounded-full px-1.5 py-0.5">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + Unread only toggle */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-rf-border shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-rf-ink-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search notifications..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-rf-surface-page border border-rf-border rounded-md placeholder-rf-ink-400 text-rf-text-primary focus:outline-none focus:ring-1 focus:ring-rf-blue focus:border-rf-blue"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-rf-text-secondary cursor-pointer select-none whitespace-nowrap">
              <span>Unread only</span>
              <button
                role="switch"
                aria-checked={unreadOnly}
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  unreadOnly ? "bg-rf-blue" : "bg-rf-ink-200"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    unreadOnly ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-rf-text-muted">
                Loading…
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center py-12 text-rf-text-muted gap-2">
                <Bell className="w-8 h-8 opacity-20" />
                <p className="text-sm">
                  {search
                    ? "No notifications match your search"
                    : tab === "unread" || unreadOnly
                    ? "You're all caught up!"
                    : "No notifications yet"}
                </p>
              </div>
            ) : (
              grouped.order.map((group) => (
                <div key={group}>
                  {/* Date group header */}
                  <div className="px-4 py-1.5 text-[11px] font-semibold text-rf-ink-400 uppercase tracking-wider bg-rf-surface-page sticky top-0 z-10">
                    {group}
                  </div>

                  {grouped.groups[group].map((item) => {
                    const url = actionUrl(item, companyId, accountId);
                    const isUnread = !item.read_at;

                    const inner = (
                      <div
                        className={`flex gap-3 px-4 py-3 transition-colors border-b border-rf-ink-100 last:border-0 ${
                          isUnread
                            ? "bg-rf-blue-tint/30 hover:bg-rf-blue-tint/50"
                            : "hover:bg-rf-surface-page"
                        } ${url || isUnread ? "cursor-pointer" : ""}`}
                        onClick={() => {
                          if (isUnread) handleMarkRead(item.id);
                          if (url) window.location.href = url;
                        }}
                      >
                        <div className="mt-0.5">
                          <TypeIcon type={item.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-rf-text-primary leading-snug">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                              <span className="text-[11px] text-rf-text-muted whitespace-nowrap">
                                {timeAgo(item.created_at)}
                              </span>
                              {isUnread && (
                                <span className="w-2 h-2 rounded-full bg-rf-blue shrink-0" />
                              )}
                            </div>
                          </div>
                          {item.body && (
                            <p className="text-xs text-rf-text-secondary mt-0.5 leading-relaxed line-clamp-2">
                              {item.body}
                            </p>
                          )}
                        </div>
                      </div>
                    );

                    return <div key={item.id}>{inner}</div>;
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="px-4 py-2.5 border-t border-rf-border flex items-center justify-between shrink-0">
              <button
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                className="flex items-center gap-1.5 text-xs text-rf-text-secondary hover:text-rf-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all as read
              </button>
              <span className="text-xs text-rf-text-muted">
                {items.length} notification{items.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
