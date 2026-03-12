"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Zap,
  Settings,
  ScrollText,
  ChevronDown,
  ChevronUp,
  Clock,
  Type,
  Hash,
  CalendarDays,
  CheckSquare,
  Mail,
  Phone,
  MapPin,
  CircleDot,
  Paperclip,
  ArrowRightLeft,
  Search,
} from "lucide-react";
import { getActivityEvents, type ActivityEvent } from "@/app/dashboard/[companyId]/jobs/[jobId]/applicants/activity-actions";
import { revertCellChange } from "@/app/dashboard/[companyId]/jobs/[jobId]/applicants/actions";

// ─── Time-ago helper ─────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;

  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Avatar helpers ──────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-rf-blue", "bg-rf-success", "bg-rf-warning", "bg-purple-500",
  "bg-rf-danger", "bg-cyan-500", "bg-pink-500", "bg-rf-blue-dark",
];

function actorColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ name, actorType }: { name: string; actorType: string }) {
  const initials = name ? name.charAt(0).toUpperCase() : "?";
  if (actorType === "automation") {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 shrink-0">
        <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
      </div>
    );
  }
  if (actorType === "system") {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-rf-ink-100 shrink-0">
        <Settings className="w-3 h-3 text-rf-text-secondary" />
      </div>
    );
  }
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0 ${actorColor(name)}`}>
      {initials}
    </div>
  );
}

// ─── Field type icon ─────────────────────────────────────────────────────────

function FieldIcon({ columnType }: { columnType?: string }) {
  const cls = "w-3 h-3 text-rf-text-muted";
  switch (columnType) {
    case "text":     return <Type className={cls} />;
    case "number":   return <Hash className={cls} />;
    case "date":     return <CalendarDays className={cls} />;
    case "checkbox": return <CheckSquare className={cls} />;
    case "email":    return <Mail className={cls} />;
    case "phone":    return <Phone className={cls} />;
    case "location": return <MapPin className={cls} />;
    case "status":   return <CircleDot className={cls} />;
    case "file":     return <Paperclip className={cls} />;
    default:
      if (columnType?.startsWith("fadv.")) return <Paperclip className={cls} />;
      return null;
  }
}

// ─── Value display ───────────────────────────────────────────────────────────

function ValuePill({ value, isStatus, label }: { value: any; isStatus?: boolean; label?: string | null }) {
  const display = isStatus && label ? label : value;
  if (display === null || display === undefined || display === "") {
    return <span className="text-[11px] text-rf-text-muted">—</span>;
  }
  if (isStatus) {
    return (
      <span className="inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium bg-rf-ink-100 text-rf-ink-700 truncate max-w-[80px]" title={String(display)}>
        {String(display)}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-rf-text-secondary truncate max-w-[80px]" title={String(display)}>
      {String(display)}
    </span>
  );
}

// ─── Cell change row (Monday-style horizontal layout) ────────────────────────

const CELL_EVENTS = new Set(["cell.updated", "cells.bulk_updated"]);

function CellChangeRow({
  event,
  companyId,
  jobId,
  isUndone,
  onUndo,
}: {
  event: ActivityEvent;
  companyId: string;
  jobId: string;
  isUndone: boolean;
  onUndo: (eventId: string) => void;
}) {
  const actorName: string = event.data?.actor_name ?? "";
  const [undoing, setUndoing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isBulk = event.event_type === "cells.bulk_updated";
  const changes: { applicant_id: string; applicant_name: string; old_value: any }[] = event.data?.changes ?? [];
  const isStatus = event.data?.column_type === "status";
  const isReverted = event.event_type === "cell.reverted" || event.event_type === "cells.bulk_reverted";

  async function handleUndo() {
    setUndoing(true);
    try {
      const result = await revertCellChange(companyId, jobId, event.id);
      if (result.ok) onUndo(event.id);
      else console.error("[ActivityLogDrawer] Revert failed:", result.error);
    } finally {
      setUndoing(false);
    }
  }

  // Single cell change — one clean row
  if (!isBulk) {
    return (
      <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-rf-ink-100/60 transition-colors ${isUndone ? "opacity-30" : "hover:bg-rf-surface-page/60"}`}>
        {/* Time */}
        <div className="flex items-center gap-1 w-[42px] shrink-0">
          <Clock className="w-3 h-3 text-rf-text-muted" />
          <span className="text-[11px] text-rf-text-muted font-medium">{timeAgo(event.created_at)}</span>
        </div>

        {/* Avatar */}
        <Avatar name={actorName} actorType={event.actor_type} />

        {/* Subject name */}
        <span className="text-[12px] font-medium text-rf-text-primary truncate w-[100px] shrink-0" title={event.data?.applicant_name}>
          {event.data?.applicant_name ?? "—"}
        </span>

        {/* Field */}
        <div className="flex items-center gap-1 shrink-0 w-[90px]">
          <FieldIcon columnType={event.data?.column_type} />
          <span className="text-[11px] text-rf-text-secondary truncate" title={event.data?.column_name}>
            {event.data?.column_name ?? "—"}
          </span>
        </div>

        {/* Old → New */}
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          <ValuePill value={event.data?.old_value} isStatus={isStatus} label={event.data?.old_label} />
          <span className="text-rf-text-muted text-[10px] shrink-0">›</span>
          <ValuePill value={event.data?.new_value} isStatus={isStatus} label={event.data?.new_label} />
        </div>

        {/* Undo */}
        <div className="w-[48px] shrink-0 flex justify-end">
          {!isUndone && !isReverted && (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="text-[11px] text-rf-text-secondary border border-rf-border rounded px-1.5 py-0.5 hover:bg-rf-surface-page hover:text-rf-ink-700 hover:border-rf-ink-300 transition-colors disabled:opacity-50 font-medium"
            >
              {undoing ? <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : "Undo"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Bulk cell change — expandable group
  return (
    <div className={`border-b border-rf-ink-100/60 transition-colors ${isUndone ? "opacity-30" : ""}`}>
      {/* Header row */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 ${!isUndone && "hover:bg-rf-surface-page/60"}`}>
        <div className="flex items-center gap-1 w-[42px] shrink-0">
          <Clock className="w-3 h-3 text-rf-text-muted" />
          <span className="text-[11px] text-rf-text-muted font-medium">{timeAgo(event.created_at)}</span>
        </div>

        <Avatar name={actorName} actorType={event.actor_type} />

        <span className="text-[12px] font-medium text-rf-text-primary truncate w-[100px] shrink-0">
          {changes.length} applicant{changes.length !== 1 ? "s" : ""}
        </span>

        <div className="flex items-center gap-1 shrink-0 w-[90px]">
          <FieldIcon columnType={event.data?.column_type} />
          <span className="text-[11px] text-rf-text-secondary truncate" title={event.data?.column_name}>
            {event.data?.column_name ?? "—"}
          </span>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-0.5 text-[11px] text-rf-blue hover:text-rf-blue-dark transition-colors flex-1 min-w-0 justify-end"
        >
          {expanded ? "Hide" : "Show"} details
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <div className="w-[48px] shrink-0 flex justify-end">
          {!isUndone && (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="text-[11px] text-rf-text-secondary border border-rf-border rounded px-1.5 py-0.5 hover:bg-rf-surface-page hover:text-rf-ink-700 hover:border-rf-ink-300 transition-colors disabled:opacity-50 font-medium"
            >
              {undoing ? <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : "Undo"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded sub-rows */}
      {expanded && (
        <div className="bg-rf-surface-page/40 border-t border-rf-ink-100/40">
          {changes.map((c) => (
            <div key={c.applicant_id} className="flex items-center gap-2.5 px-4 py-1.5 pl-[72px]">
              <span className="text-[11px] font-medium text-rf-text-primary truncate w-[100px] shrink-0" title={c.applicant_name}>
                {c.applicant_name}
              </span>
              <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
                <ValuePill value={c.old_value} isStatus={isStatus} label={(c as any).old_label} />
                <span className="text-rf-text-muted text-[10px] shrink-0">›</span>
                <ValuePill value={event.data?.new_value} isStatus={isStatus} label={event.data?.new_label} />
              </div>
              <div className="w-[48px] shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Generic event row (non-cell events) ─────────────────────────────────────

function GenericEventRow({ event }: { event: ActivityEvent }) {
  const actorName: string = event.data?.actor_name ?? "";

  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-rf-ink-100/60 hover:bg-rf-surface-page/60 transition-colors">
      {/* Time */}
      <div className="flex items-center gap-1 w-[42px] shrink-0 mt-0.5">
        <Clock className="w-3 h-3 text-rf-text-muted" />
        <span className="text-[11px] text-rf-text-muted font-medium">{timeAgo(event.created_at)}</span>
      </div>

      {/* Avatar */}
      <div className="mt-0.5">
        <Avatar name={actorName} actorType={event.actor_type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-rf-text-primary leading-relaxed">{event.summary}</p>
        {event.data?.automation_name && (
          <p className="text-[11px] text-rf-text-muted mt-0.5 truncate">
            <Zap className="w-2.5 h-2.5 inline -mt-px mr-0.5 text-amber-500" />
            {event.data.automation_name}
          </p>
        )}
        {event.data?.group_name && (
          <p className="text-[11px] text-rf-text-muted mt-0.5">Group: {event.data.group_name}</p>
        )}
        {event.data?.error && (
          <p className="text-[11px] text-rf-danger mt-0.5 truncate">{event.data.error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Event row dispatcher ────────────────────────────────────────────────────

function EventRow(props: {
  event: ActivityEvent;
  companyId: string;
  jobId: string;
  isUndone: boolean;
  onUndo: (eventId: string) => void;
}) {
  const isCellEvent = CELL_EVENTS.has(props.event.event_type)
    || props.event.event_type === "cell.reverted"
    || props.event.event_type === "cells.bulk_reverted";

  if (isCellEvent) return <CellChangeRow {...props} />;
  return <GenericEventRow event={props.event} />;
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

type Tab = "activity" | "automation";

interface ActivityLogDrawerProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  jobId: string;
}

export function ActivityLogDrawer({ open, onClose, companyId, jobId }: ActivityLogDrawerProps) {
  const [tab, setTab] = useState<Tab>("activity");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const eventTypeFilter = tab === "automation" ? "automation" : undefined;

  // ── Load initial / reset on tab or search change ─────────────────────────

  const loadEvents = useCallback(async (reset = false) => {
    setLoading(true);
    const { events: newEvents, nextCursor: cursor } = await getActivityEvents(
      companyId,
      jobId,
      {
        limit: 50,
        cursor: reset ? undefined : nextCursor ?? undefined,
        search: search || undefined,
        eventTypeFilter,
      }
    );
    if (reset) {
      setEvents(newEvents);
    } else {
      setEvents((prev) => [...prev, ...newEvents]);
    }
    setNextCursor(cursor);
    setLoading(false);
    setInitialLoaded(true);
  }, [companyId, jobId, search, eventTypeFilter, nextCursor]);

  // Reset and reload when drawer opens or tab/search changes
  useEffect(() => {
    if (!open) return;
    setInitialLoaded(false);
    setEvents([]);
    setNextCursor(null);
    setUndoneIds(new Set());

    const run = async () => {
      setLoading(true);
      const { events: newEvents, nextCursor: cursor } = await getActivityEvents(
        companyId,
        jobId,
        {
          limit: 50,
          search: search || undefined,
          eventTypeFilter,
        }
      );
      setEvents(newEvents);
      setNextCursor(cursor);
      setLoading(false);
      setInitialLoaded(true);
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, search]);

  // ── IntersectionObserver for infinite scroll ──────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loading) {
          loadEvents(false);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loading, loadEvents]);

  // ── Close on Escape ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchOpen) { setSearchOpen(false); setSearch(""); }
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, searchOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  function handleUndo(eventId: string) {
    setUndoneIds(prev => new Set([...prev, eventId]));
    setTimeout(() => loadEvents(true), 800);
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-screen w-[540px] z-50 bg-rf-surface-card border-l border-rf-border shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-rf-border shrink-0">
          <h2 className="text-sm font-semibold text-rf-text-primary">Activity Log</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(o => !o)}
              className={`p-1.5 rounded-md transition-colors ${searchOpen ? "bg-rf-blue-tint text-rf-blue" : "text-rf-text-muted hover:text-rf-ink-500 hover:bg-rf-surface-page"}`}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-rf-text-muted hover:text-rf-ink-500 hover:bg-rf-surface-page transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs + toolbar row */}
        <div className="flex items-center justify-between px-4 border-b border-rf-border shrink-0">
          <div className="flex">
            {(["activity", "automation"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium capitalize transition-colors relative ${
                  tab === t
                    ? "text-rf-blue"
                    : "text-rf-text-secondary hover:text-rf-ink-700"
                }`}
              >
                {t === "automation" ? "Automation activity" : "Other activities"}
                {tab === t && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-rf-blue rounded-t" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search (collapsible) */}
        {searchOpen && (
          <div className="px-4 py-2 border-b border-rf-ink-100/60 shrink-0 bg-rf-surface-page/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rf-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activity…"
                className="w-full h-7 pl-8 pr-3 rounded-md border border-rf-border bg-rf-surface-card text-xs text-rf-ink-700 placeholder-rf-text-muted focus:outline-none focus:ring-1 focus:ring-rf-blue transition-colors"
              />
            </div>
          </div>
        )}

        {/* Event list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!initialLoaded && loading ? (
            <div className="flex items-center justify-center h-24 text-xs text-rf-text-muted">
              Loading…
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-rf-text-muted px-6 text-center">
              <ScrollText className="w-8 h-8 opacity-20" />
              <div>
                <p className="text-sm font-medium text-rf-text-secondary">No activity yet</p>
                <p className="text-xs text-rf-text-muted mt-1">Changes to applicants will appear here.</p>
              </div>
            </div>
          ) : (
            <>
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  companyId={companyId}
                  jobId={jobId}
                  isUndone={undoneIds.has(event.id)}
                  onUndo={handleUndo}
                />
              ))}

              <div ref={sentinelRef} className="h-4" />

              {loading && (
                <div className="py-3 text-center text-[11px] text-rf-text-muted">
                  Loading more…
                </div>
              )}

              {!nextCursor && events.length > 0 && (
                <div className="py-4 text-center text-[11px] text-rf-text-muted">
                  End of activity
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
