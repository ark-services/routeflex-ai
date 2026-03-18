"use client";

import { useState } from "react";
import { setSlackChannel } from "@/lib/help-center/actions";
import { Loader2, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export function SlackChannelPicker({
  channels,
  currentChannelId,
}: {
  channels: { id: string; name: string }[];
  currentChannelId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentChannelId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const channel = channels.find((c) => c.id === selected);
    if (!channel || selected === currentChannelId) return;
    setSaving(true);
    setSaved(false);
    await setSlackChannel(channel.id, channel.name);
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  if (channels.length === 0) {
    return (
      <p className="text-xs text-rf-text-muted mt-1">
        No channels found. Make sure the bot has been added to your workspace.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <select
        value={selected}
        onChange={(e) => { setSelected(e.target.value); setSaved(false); }}
        className="text-sm px-2.5 py-1.5 border border-rf-border rounded-rf-md bg-rf-surface-card text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue"
      >
        {!currentChannelId && (
          <option value="">— Select a channel —</option>
        )}
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving || selected === currentChannelId || !selected}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rf-blue hover:bg-rf-blue-dark rounded-rf-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5" />
        ) : null}
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
