export function HeroAgentTeamMockup() {
  const agents = [
    {
      emoji: "🔍",
      name: "Screener Agent",
      tasks: 3,
      description: "AI screening, scoring, follow-ups",
    },
    {
      emoji: "🛡️",
      name: "FADV Agent",
      tasks: 4,
      description: "Background check submission & tracking",
    },
    {
      emoji: "📋",
      name: "HR Agent",
      tasks: 2,
      description: "Paperwork, training, onboarding",
    },
    {
      emoji: "✈️",
      name: "TSA Agent",
      tasks: 1,
      description: "TSA vetting status & follow-up",
    },
    {
      emoji: "📊",
      name: "Pipeline Admin",
      tasks: 2,
      description: "Cleanup, archival, Day 1 scheduling",
    },
  ];

  const activity = [
    {
      agent: "Screener Agent",
      text: "scored 4 applicants — 2 qualified",
      time: "2m",
      dot: "bg-rf-blue",
    },
    {
      agent: "FADV Agent",
      text: "auto-submitted Tom Lee",
      time: "15m",
      dot: "bg-[#16A34A]",
    },
    {
      agent: "HR Agent",
      text: "sent paperwork to Diana Patel",
      time: "1h",
      dot: "bg-[#D97706]",
    },
  ];

  return (
    <div className="rounded-rf-xl border border-rf-border bg-rf-surface-card shadow-rf-xl overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-rf-border bg-rf-surface-page">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rf-ink-100" />
          <div className="w-2.5 h-2.5 rounded-full bg-rf-ink-100" />
          <div className="w-2.5 h-2.5 rounded-full bg-rf-ink-100" />
        </div>
        <div className="flex-1 mx-3">
          <div className="bg-rf-surface-card rounded-rf-md border border-rf-border px-3 py-1 text-[10px] font-mono text-rf-text-muted text-center">
            app.routeflex.ai/agents
          </div>
        </div>
      </div>

      <div className="p-4 bg-rf-surface-page">
        {/* Team header */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold text-rf-text-muted uppercase tracking-wider">
            Your Agent Team · P&D Driver
          </div>
          <div className="text-[9px] font-mono text-rf-success bg-rf-success-bg px-2 py-0.5 rounded-rf-pill">
            5 agents active
          </div>
        </div>

        {/* Agent rows */}
        <div className="space-y-1.5 mb-4">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="flex items-center gap-2.5 rounded-rf-md bg-rf-surface-card border border-rf-border px-3 py-2"
            >
              <span className="text-sm flex-shrink-0">{agent.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-rf-text-primary leading-tight">
                  {agent.name}
                </div>
                <div className="text-[8px] font-mono text-rf-text-muted truncate">
                  {agent.description}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[8px] font-mono text-rf-text-muted">
                  {agent.tasks} tasks
                </span>
                <div className="w-5 h-3 rounded-full bg-rf-success relative">
                  <div className="absolute right-0.5 top-0.5 w-2 h-2 rounded-full bg-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Separator */}
        <div className="border-t border-rf-border my-3" />

        {/* Live activity */}
        <div className="text-[9px] font-bold text-rf-text-muted uppercase tracking-wider mb-2">
          Live Activity
        </div>
        <div className="space-y-1.5">
          {activity.map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-2 text-[10px]"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${item.dot} flex-shrink-0`}
              />
              <span className="text-rf-text-secondary flex-1 truncate">
                <span className="font-semibold text-rf-text-primary">
                  {item.agent}
                </span>{" "}
                {item.text}
              </span>
              <span className="text-rf-text-muted font-mono flex-shrink-0">
                {item.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
