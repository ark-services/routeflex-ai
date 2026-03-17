"use client";

import { useState, useCallback } from "react";
import { Search, X, FileText } from "lucide-react";
import Link from "next/link";
import { searchArticles } from "@/lib/help-center/actions";
import type { HelpArticle } from "@/lib/help-center/types";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HelpArticle[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (value.trim().length < 2) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      setSearching(true);
      try {
        const found = await searchArticles(value.trim());
        setResults(found);
        setHasSearched(true);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  return (
    <div id="search" className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-rf-text-muted" />
        <input
          type="text"
          placeholder="Search documentation..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-12 pr-10 py-3.5 rounded-rf-xl bg-rf-surface-card border border-rf-border text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all text-sm"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setHasSearched(false);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-rf-text-muted hover:text-rf-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {hasSearched && (
        <div className="mt-3 bg-rf-surface-card border border-rf-border rounded-rf-lg overflow-hidden shadow-rf-md">
          {searching ? (
            <div className="p-4 text-sm text-rf-text-muted text-center">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm text-rf-text-muted text-center">
              No articles found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul className="divide-y divide-rf-border">
              {results.map((article) => {
                const cat = article.category as unknown as {
                  slug: string;
                  title: string;
                };
                return (
                  <li key={article.id}>
                    <Link
                      href={`/help-center/${cat?.slug}/${article.slug}`}
                      className="flex items-start gap-3 p-4 hover:bg-rf-ink-100/50 transition-colors"
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-rf-blue shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-rf-text-primary truncate">
                          {article.title}
                        </p>
                        {article.summary && (
                          <p className="text-xs text-rf-text-muted mt-0.5 line-clamp-2">
                            {article.summary}
                          </p>
                        )}
                        {cat && (
                          <span className="inline-block mt-1 text-xs text-rf-text-muted bg-rf-ink-100/50 px-2 py-0.5 rounded-full">
                            {cat.title}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
