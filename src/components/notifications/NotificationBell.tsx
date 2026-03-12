"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { getNotifications, markAllRead, type NotificationItem } from "./actions";

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

function NotificationIcon({ type }: { type: NotificationItem["type"] }) {
  if (type === "error")
    return <AlertCircle className="w-4 h-4 text-rf-danger flex-shrink-0 mt-0.5" />;
  if (type === "alert")
    return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />;
  return <Info className="w-4 h-4 text-rf-blue flex-shrink-0 mt-0.5" />;
}

function actionUrl(item: NotificationItem, companyId: string, accountId: string): string | null {
  const source = item.metadata?.source as string | undefined;
  if (source === "gmail.missing_read_scope") {
    return `/admin/${accountId}/companies/${companyId}/integrations`;
  }
  return null;
}

export function NotificationBell({ companyId, accountId }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    const result = await getNotifications(companyId);
    setItems(result.items);
    setUnreadCount(result.unreadCount);
    setLoading(false);
  }, [companyId]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      // Optimistically mark as read in UI
      setUnreadCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      await markAllRead(companyId);
    }
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 border-l-2 ${
          open
            ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
            : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
        }`}
      >
        <div className="relative flex-shrink-0">
          <Bell className={`h-4 w-4 ${open ? "text-rf-blue" : "text-rf-text-muted"}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center bg-rf-danger text-white text-[9px] font-bold rounded-full leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        <span className="flex-1">Notifications</span>
        {unreadCount > 0 && (
          <span className="text-xs bg-rf-danger text-white font-bold rounded-full px-1.5 py-0.5 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute left-full top-0 ml-2 z-50 w-80 bg-rf-surface-card rounded-xl shadow-rf-xl border border-rf-border overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-rf-border">
            <span className="text-sm font-semibold text-rf-text-primary">Notifications</span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md hover:bg-rf-surface-page transition-colors"
            >
              <X className="w-3.5 h-3.5 text-rf-text-muted" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto divide-y divide-rf-ink-100">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-rf-text-muted">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-rf-text-muted">
                No notifications
              </div>
            ) : (
              items.map((item) => {
                const url = actionUrl(item, companyId, accountId);
                const content = (
                  <div
                    className={`flex gap-3 px-4 py-3 hover:bg-rf-surface-page transition-colors ${
                      !item.read_at ? "bg-rf-blue-tint/40" : ""
                    } ${url ? "cursor-pointer" : ""}`}
                  >
                    <NotificationIcon type={item.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-rf-text-primary leading-snug">
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="text-xs text-rf-text-secondary mt-0.5 leading-snug line-clamp-2">
                          {item.body}
                        </p>
                      )}
                      <p className="text-[11px] text-rf-text-muted mt-1">
                        {timeAgo(item.created_at)}
                      </p>
                    </div>
                    {!item.read_at && (
                      <div className="w-1.5 h-1.5 rounded-full bg-rf-blue flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                );

                return url ? (
                  <a key={item.id} href={url} onClick={() => setOpen(false)}>
                    {content}
                  </a>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
