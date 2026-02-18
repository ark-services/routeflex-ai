"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Template } from "@/lib/types";
import { TemplateThumbnail } from "./template-thumbnail";

interface Props {
  templates: Template[];
  companyId: string;
}

export function TemplateCenterGrid({ templates, companyId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? templates.filter(
        (t) =>
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          (t.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : templates;

  return (
    <div>
      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">
            {query ? `No templates match "${query}"` : "No templates available yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() =>
                router.push(`/dashboard/${companyId}/template-center/${t.id}`)
              }
              className="group text-left bg-white border border-stone-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {/* Thumbnail */}
              <div className="h-36 bg-stone-100 overflow-hidden">
                <TemplateThumbnail
                  thumbnailPath={t.thumbnail_path}
                  title={t.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
              </div>

              {/* Card body */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-stone-900 leading-tight line-clamp-1">
                  {t.title}
                </h3>
                {t.description && (
                  <p className="mt-1 text-xs text-stone-500 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                )}
                <div className="mt-3">
                  <span className="inline-block text-xs font-medium text-blue-600 group-hover:underline">
                    View template →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
