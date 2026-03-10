"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ACTION_CATEGORIES } from "./ActionTypePicker";

export function ActionTypeLabel({
  type,
  actionTypes,
  onChange,
}: {
  type: string;
  actionTypes: Array<{ value: string; label: string }>;
  onChange: (type: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = actionTypes.find((t) => t.value === type);

  const filtered = ACTION_CATEGORIES.map((cat) => ({
    ...cat,
    actions: cat.actions.filter((a) =>
      a.label.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.actions.length > 0);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs font-medium text-rf-success hover:text-green-900 hover:bg-rf-success-bg px-2 py-0.5 rounded transition-colors flex items-center gap-1"
      >
        {current?.label || type}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch(""); }} />
          <div className="absolute z-20 left-0 mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-xl max-h-72 w-64 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-rf-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rf-text-muted" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-rf-border rounded-md focus:outline-none focus:ring-1 focus:ring-green-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto">
              {filtered.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-rf-text-muted uppercase tracking-wider bg-rf-surface-page">
                    {cat.label}
                  </div>
                  {cat.actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.value}
                        onClick={() => {
                          onChange(action.value);
                          setIsOpen(false);
                          setSearch("");
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-rf-success-bg transition-colors flex items-center gap-2.5 text-sm ${
                          action.value === type ? "bg-rf-success-bg text-rf-success" : ""
                        }`}
                      >
                        <Icon className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-sm text-rf-text-muted text-center">No matching actions</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
