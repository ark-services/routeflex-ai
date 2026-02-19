"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Zap, Settings, ScrollText } from "lucide-react";
import { getActivityEvents, type ActivityEvent } from "@/app/dashboard/[companyId]/jobs/[jobId]/applicants/activity-actions";

// ─── Time-ago helper (no date-fns dependency) ────────────────────────────────

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;

  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-amber-500", "bg-purple-500",
  "bg-red-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500",
];

function actorColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: ActivityEvent }) {
  const actorName: string = event.data?.actor_name ?? "";
  const initials = actorName ? actorName.charAt(0).toUpperCase() : "?";

  return (
    <div className="flex gap-3 px-4 py-3 hover:bg-stone-50 transition-colors border-b border-stone-100 last:border-0">
      {/* Avatar / icon */}
      <div className="flex-shrink-0 mt-0.5">
        {event.actor_type === "user" ? (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold ${actorColor(actorName)}`}
          >
            {initials}
          </div>
        ) : event.actor_type === "automation" ? (
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-100">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-100">
            <Settings className="w-3.5 h-3.5 text-stone-500" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 leading-snug">{event.summary}</p>
        {event.data?.group_name && (
          <p className="text-xs text-stone-400 mt-0.5">Group: {event.data.group_name}</p>
        )}
        {event.data?.automation_name && (
          <p className="text-xs text-stone-400 mt-0.5">Automation: {event.data.automation_name}</p>
        )}
        {event.data?.error && (
          <p className="text-xs text-red-500 mt-0.5 truncate">{event.data.error}</p>
        )}
      </div>

      {/* Time */}
      <div className="flex-shrink-0 text-xs text-stone-400 mt-0.5 whitespace-nowrap">
        {timeAgo(event.created_at)}
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

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
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-screen w-[480px] z-50 bg-white border-l border-stone-200 shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-stone-600" />
            <h2 className="text-sm font-semibold text-stone-800">Activity Log</h2>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-200 shrink-0">
          {(["activity", "automation"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-stone-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity…"
            className="w-full h-8 px-3 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
        </div>

        {/* Event list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!initialLoaded && loading ? (
            <div className="flex items-center justify-center h-24 text-sm text-stone-400">
              Loading…
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-stone-400">
              <ScrollText className="w-8 h-8 opacity-30" />
              <span className="text-sm">No activity yet</span>
            </div>
          ) : (
            <>
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-4" />

              {loading && (
                <div className="py-3 text-center text-xs text-stone-400">
                  Loading more…
                </div>
              )}

              {!nextCursor && events.length > 0 && (
                <div className="py-3 text-center text-xs text-stone-400">
                  All caught up
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
