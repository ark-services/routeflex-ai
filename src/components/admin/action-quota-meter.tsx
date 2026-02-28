export function ActionQuotaMeter({ used, limit, resetDate }: { used: number; limit: number; resetDate: string }) {
  const percentage = Math.min((used / limit) * 100, 100);
  const remaining = limit - used;
  const barColor = percentage >= 100 ? "bg-rf-danger" : percentage >= 90 ? "bg-rf-warning" : "bg-emerald-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-rf-ink-500">{used.toLocaleString()} of {limit.toLocaleString()} actions used</span>
        <span className={`font-medium ${remaining < 0 ? "text-rf-danger" : "text-rf-text-primary"}`}>{remaining.toLocaleString()} remaining</span>
      </div>
      <div className="h-3 w-full rounded-full bg-rf-ink-100 overflow-hidden">
        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${percentage}%` }} />
      </div>
      <div className="text-xs text-rf-text-secondary">Resets on {new Date(resetDate).toLocaleDateString()}</div>
    </div>
  );
}
