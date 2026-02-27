"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { BookOpen, Eye, EyeOff, Users, Search, ChevronUp, ChevronDown } from "lucide-react";

type Course = {
  id: string;
  name: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  enrollmentCount: number;
};

type SortKey = "name" | "created_at" | "enrollmentCount";
type SortDir = "asc" | "desc";

export function TrainingListClient({
  courses,
  companyId,
}: {
  courses: Course[];
  companyId: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? courses.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.description ?? "").toLowerCase().includes(q)
        )
      : [...courses];

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "enrollmentCount") cmp = a.enrollmentCount - b.enrollmentCount;
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [courses, search, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-blue-600" />
    ) : (
      <ChevronDown className="w-3 h-3 text-blue-600" />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + sort controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses…"
            className="w-full pl-8 pr-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-stone-500 font-medium shrink-0">
          <span className="mr-1">Sort:</span>
          {(
            [
              { key: "name" as SortKey, label: "Name" },
              { key: "created_at" as SortKey, label: "Date" },
              { key: "enrollmentCount" as SortKey, label: "Learners" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`flex items-center gap-0.5 px-2 py-1 rounded transition-colors ${
                sortKey === key
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-stone-500 hover:bg-stone-100 border border-transparent"
              }`}
            >
              {label}
              <SortIcon col={key} />
            </button>
          ))}
        </div>
      </div>

      {/* Course list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-stone-400">
          <p className="text-sm">No courses match &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="relative flex items-center gap-4 p-4 bg-white border border-stone-200 rounded-lg hover:border-stone-300 hover:shadow-sm transition-all"
            >
              <Link
                href={`/dashboard/${companyId}/training/${c.id}`}
                className="absolute inset-0 rounded-lg"
                aria-label={c.name}
              />
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-stone-900">{c.name}</span>
                  {c.is_published ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-green-50 text-green-700 rounded-full border border-green-200">
                      <Eye className="w-3 h-3" /> Published
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-stone-100 text-stone-500 rounded-full border border-stone-200">
                      <EyeOff className="w-3 h-3" /> Draft
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="text-xs text-stone-500 truncate mt-0.5">{c.description}</p>
                )}
              </div>
              <div className="relative z-10 flex items-center gap-4 flex-shrink-0">
                <Link
                  href={`/dashboard/${companyId}/training/${c.id}/learners`}
                  className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors"
                  aria-label={`${c.enrollmentCount} learners enrolled in ${c.name}`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{c.enrollmentCount}</span>
                </Link>
                <div className="text-xs text-stone-400">
                  {new Date(c.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
