"use client";

import { useState } from "react";
import { Plus, Search, ArrowRight, RefreshCw, Trash2, Calendar, Hash, TrendingUp, Mail, MessageSquare, Phone, PhoneCall, ExternalLink, GraduationCap, ClipboardList, Settings, Shield, Award, Brain } from "lucide-react";

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
      { value: "screening.send_link", label: "Send screening link", icon: ClipboardList },
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
        className="w-full px-4 py-3.5 border-2 border-dashed border-emerald-300/50 rounded-rf-lg text-rf-text-muted hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/40 transition-all flex items-center justify-center gap-2 text-base font-medium"
      >
        <Plus className="w-5 h-5" />
        Add action
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch(""); }} />
          <div className="absolute z-20 left-0 right-0 mt-2 bg-rf-surface-card border border-rf-border rounded-rf-lg shadow-rf-xl max-h-96 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-rf-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rf-ink-300" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-rf-ink-100 rounded-rf-md focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 placeholder:text-rf-ink-300"
                  autoFocus
                />
              </div>
            </div>

            {/* Categories */}
            <div className="overflow-y-auto">
              {filtered.map((cat) => (
                <div key={cat.label}>
                  <div className="px-4 py-2 text-xs font-bold text-rf-ink-300 uppercase tracking-widest bg-rf-surface-page/80">
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
                        className="w-full px-4 py-2.5 text-left hover:bg-emerald-50 transition-colors flex items-center gap-3 text-[15px]"
                      >
                        <Icon className="w-4.5 h-4.5 text-rf-ink-300 flex-shrink-0" />
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
