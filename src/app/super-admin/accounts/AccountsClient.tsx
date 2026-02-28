"use client";

import { useState, useTransition } from "react";
import { changePlan, addExtraCredits } from "./actions";

const PLAN_COLORS: Record<string, string> = {
  free:       "bg-rf-ink-100 text-rf-ink-500",
  basic:      "bg-rf-blue-tint text-rf-blue",
  pro:        "bg-violet-50 text-violet-700",
  enterprise: "bg-rf-warning-bg text-rf-warning",
};

interface EnrichedAccount {
  id: string;
  name: string;
  plan_type: string;
  max_seats: number;
  created_at: string;
  seats_used: number;
  company_count: number;
  actions_used: number;
  actions_quota: number;
  extra_credits: number;
}

interface Plan {
  id: string;
  name: string;
  max_seats: number;
}

interface Props {
  accounts: EnrichedAccount[];
  plans: Plan[];
}

export function AccountsClient({ accounts, plans }: Props) {
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function setMsg(accountId: string, msg: string) {
    setFeedback((f) => ({ ...f, [accountId]: msg }));
    setTimeout(() => setFeedback((f) => ({ ...f, [accountId]: "" })), 4000);
  }

  function handlePlanChange(accountId: string, newPlan: string) {
    startTransition(async () => {
      const result = await changePlan(accountId, newPlan);
      if ("error" in result && result.error) {
        setMsg(accountId, `Error: ${result.error}`);
      } else {
        setMsg(accountId, "Plan updated ✓");
      }
    });
  }

  function handleAddCredits(accountId: string) {
    const raw = creditInputs[accountId];
    const amount = parseInt(raw ?? "", 10);
    if (!raw || isNaN(amount) || amount <= 0) {
      setMsg(accountId, "Enter a positive number");
      return;
    }
    startTransition(async () => {
      const result = await addExtraCredits(accountId, amount);
      if ("error" in result && result.error) {
        setMsg(accountId, `Error: ${result.error}`);
      } else {
        setMsg(accountId, `+${amount.toLocaleString()} credits added ✓`);
        setCreditInputs((c) => ({ ...c, [accountId]: "" }));
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <div className="text-sm text-rf-text-secondary py-12 text-center">No accounts found.</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-rf-border bg-rf-surface-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rf-ink-100 text-left text-xs text-rf-text-secondary uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Account</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Seats</th>
            <th className="px-4 py-3 font-medium">Companies</th>
            <th className="px-4 py-3 font-medium">Actions (period)</th>
            <th className="px-4 py-3 font-medium">Extra Credits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rf-ink-100">
          {accounts.map((acct) => (
            <tr key={acct.id} className="hover:bg-rf-surface-page transition-colors">
              {/* Account name */}
              <td className="px-4 py-3">
                <div className="font-medium text-rf-text-primary">{acct.name}</div>
                <div className="text-xs text-rf-text-muted mt-0.5">
                  {new Date(acct.created_at).toLocaleDateString()}
                </div>
                {feedback[acct.id] && (
                  <div className="text-xs text-rf-success mt-1 font-medium">{feedback[acct.id]}</div>
                )}
              </td>

              {/* Plan selector */}
              <td className="px-4 py-3">
                <select
                  value={acct.plan_type}
                  disabled={isPending}
                  onChange={(e) => handlePlanChange(acct.id, e.target.value)}
                  className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer capitalize focus:ring-2 focus:ring-rf-blue focus:outline-none ${
                    PLAN_COLORS[acct.plan_type] ?? PLAN_COLORS.free
                  }`}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>

              {/* Seats */}
              <td className="px-4 py-3 text-rf-ink-700">
                {acct.seats_used} / {acct.max_seats >= 999999 ? "∞" : acct.max_seats}
              </td>

              {/* Companies */}
              <td className="px-4 py-3 text-rf-ink-700">{acct.company_count}</td>

              {/* Actions */}
              <td className="px-4 py-3">
                <div className="text-rf-ink-700">
                  {acct.actions_used.toLocaleString()} / {acct.actions_quota.toLocaleString()}
                </div>
                <div className="mt-1 h-1 rounded-full bg-rf-ink-100 overflow-hidden w-24">
                  <div
                    className="h-full rounded-full bg-blue-400"
                    style={{
                      width: `${
                        acct.actions_quota > 0
                          ? Math.min(100, (acct.actions_used / acct.actions_quota) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </td>

              {/* Extra credits */}
              <td className="px-4 py-3">
                <div className="text-xs text-rf-text-secondary mb-1">
                  Current: {acct.extra_credits.toLocaleString()}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    placeholder="Amount"
                    value={creditInputs[acct.id] ?? ""}
                    onChange={(e) =>
                      setCreditInputs((c) => ({ ...c, [acct.id]: e.target.value }))
                    }
                    disabled={isPending}
                    className="w-20 px-2 py-1 text-xs border border-rf-border rounded-lg focus:outline-none focus:ring-2 focus:ring-rf-blue disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleAddCredits(acct.id)}
                    disabled={isPending}
                    className="px-2.5 py-1 text-xs font-medium bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
