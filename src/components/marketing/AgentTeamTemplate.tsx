import { Check, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AgentTeamTemplateProps {
  icon: LucideIcon;
  name: string;
  agents: number;
  tasks: number;
  agentEmojis: string[];
  features: string[];
}

export function AgentTeamTemplate({
  icon: Icon,
  name,
  agents,
  tasks,
  agentEmojis,
  features,
}: AgentTeamTemplateProps) {
  return (
    <div className="group rounded-rf-xl border border-rf-border bg-rf-surface-page p-6 hover:shadow-rf-md hover:border-rf-blue/30 transition-all cursor-pointer">
      <div className="w-10 h-10 rounded-rf-lg bg-rf-blue-tint flex items-center justify-center mb-4 group-hover:bg-rf-blue transition-colors">
        <Icon className="h-5 w-5 text-rf-blue group-hover:text-white transition-colors" />
      </div>
      <h3 className="text-base font-bold text-rf-text-primary mb-1">{name}</h3>
      <div className="flex gap-3 text-[11px] font-mono text-rf-text-muted mb-3">
        <span>{agents} agents</span>
        <span>·</span>
        <span>{tasks} tasks</span>
      </div>

      {/* Agent emoji row */}
      <div className="flex items-center gap-1 mb-4">
        {agentEmojis.map((emoji, i) => (
          <div
            key={i}
            className="w-7 h-7 rounded-rf-md bg-rf-blue-tint flex items-center justify-center text-sm"
          >
            {emoji}
          </div>
        ))}
      </div>

      <ul className="space-y-1.5 mb-5">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-center gap-2 text-xs text-rf-text-secondary"
          >
            <Check className="h-3 w-3 text-rf-success flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <div className="text-xs font-bold text-rf-blue group-hover:text-rf-blue-dark flex items-center gap-1 transition-colors">
        Deploy This Team <ArrowRight className="h-3 w-3" />
      </div>
    </div>
  );
}
