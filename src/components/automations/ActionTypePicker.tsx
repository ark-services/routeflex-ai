"use client";

import { useState } from "react";
import { Plus, Search, ArrowRight, RefreshCw, Trash2, Calendar, Hash, TrendingUp, Mail, MessageSquare, Phone, PhoneCall, ExternalLink, GraduationCap, Settings, Shield, Award, Brain } from "lucide-react";

export const ACTION_CATEGORIES = [
  {
    label: "Move & Organize",
    actions: [
      { value: "move_group", label: "Move to group", icon: ArrowRight },
      { value: "change_status", label: "Change status", icon: RefreshCw },
      { value: "delete_item", label: "Delete item", icon: Trash2 },
      { value: "set_date", label: "Set date", icon: Calendar },
      { value: "set_number", label: "Set number", icon: Hash },
      { value: "inc_dec", label: "Increase / decrease", icon: TrendingUp },
    ],
  },
  {
    label: "Communicate",
    actions: [
      { value: "send_email_gmail", label: "Send email (Gmail)", icon: Mail },
      { value: "send_slack", label: "Send Slack notification", icon: MessageSquare },
      { value: "twilio.send_sms", label: "Send SMS", icon: Phone },
      { value: "twilio.make_call_say", label: "Call and say", icon: PhoneCall },
      { value: "portal.send_link", label: "Send portal link", icon: ExternalLink },
      { value: "lms.send_training_link", label: "Send training link", icon: GraduationCap },
    ],
  },
  {
    label: "Integrations",
    actions: [
      { value: "integration.set_field", label: "Set FADV field", icon: Settings },
      { value: "fadv.add_subject", label: "Submit to First Advantage", icon: Shield },
      { value: "fadv.approve_order", label: "Approve FADV Application", icon: Shield },
      { value: "safety_trainer.submit", label: "Submit Safety Cert", icon: Award },
    ],
  },
  {
    label: "AI",
    actions: [
      { value: "ai.score_resume", label: "Score resume with AI", icon: Brain },
    ],
  },
];

export function ActionTypePicker({ onSelect }: { onSelect: (type: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

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
        className="w-full px-3 py-2 border border-dashed border-rf-border rounded-lg text-rf-text-muted hover:border-green-400 hover:text-rf-success transition-colors flex items-center justify-center gap-1.5 text-sm"
      >
        <Plus className="w-4 h-4" />
        Add action
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch(""); }} />
          <div className="absolute z-20 left-0 right-0 mt-2 bg-rf-surface-card border border-rf-border rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
            {/* Search */}
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

            {/* Categories */}
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
                          onSelect(action.value);
                          setIsOpen(false);
                          setSearch("");
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-rf-success-bg transition-colors flex items-center gap-2.5 text-sm"
                      >
                        <Icon className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        <span className="text-rf-ink-900">{action.label}</span>
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
