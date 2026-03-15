"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

const driverOptions = [
  { label: "1–2", agencyCost: 870 },
  { label: "3–5", agencyCost: 2320 },
  { label: "6–10", agencyCost: 4640 },
  { label: "10+", agencyCost: 6960 },
];

const jobPostingOptions = [
  { label: "1–3", routeflexPrice: 149, tierName: "Starter" },
  { label: "4–10", routeflexPrice: 299, tierName: "Growth" },
  { label: "10+", routeflexPrice: 599, tierName: "Pro" },
];

export function CostCalculator() {
  const [driverIdx, setDriverIdx] = useState(0);
  const [postingIdx, setPostingIdx] = useState(0);

  const agencyCost = driverOptions[driverIdx].agencyCost;
  const routeflexCost = jobPostingOptions[postingIdx].routeflexPrice;
  const savings = agencyCost - routeflexCost;
  const savingsPercent = Math.round((savings / agencyCost) * 100);

  return (
    <div className="rounded-rf-xl border border-rf-border bg-rf-surface-card p-6 sm:p-8 shadow-rf-md">
      <div className="flex items-center gap-2 mb-6">
        <Calculator className="h-5 w-5 text-rf-blue" />
        <h3 className="text-base font-bold text-rf-text-primary">
          How much are you overpaying?
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="text-xs font-bold text-rf-text-muted uppercase tracking-wider block mb-2">
            Drivers to hire per month
          </label>
          <div className="flex gap-2">
            {driverOptions.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setDriverIdx(i)}
                className={`flex-1 py-2.5 text-sm font-bold rounded-rf-md border transition-all ${
                  driverIdx === i
                    ? "bg-rf-blue text-white border-rf-blue"
                    : "bg-rf-surface-page text-rf-text-secondary border-rf-border hover:border-rf-ink-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-rf-text-muted uppercase tracking-wider block mb-2">
            Active job postings needed
          </label>
          <div className="flex gap-2">
            {jobPostingOptions.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setPostingIdx(i)}
                className={`flex-1 py-2.5 text-sm font-bold rounded-rf-md border transition-all ${
                  postingIdx === i
                    ? "bg-rf-blue text-white border-rf-blue"
                    : "bg-rf-surface-page text-rf-text-secondary border-rf-border hover:border-rf-ink-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-rf-lg bg-rf-surface-page border border-rf-border p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-bold text-rf-text-muted uppercase tracking-wider mb-1">
              Agency cost
            </p>
            <p className="text-2xl font-black text-rf-text-primary line-through decoration-rf-danger/40 decoration-2">
              ${agencyCost.toLocaleString()}
              <span className="text-sm font-medium text-rf-text-muted">
                /mo
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-rf-text-muted uppercase tracking-wider mb-1">
              RouteFlex
            </p>
            <p className="text-2xl font-black text-rf-blue">
              ${routeflexCost}
              <span className="text-sm font-medium text-rf-text-muted">
                /mo
              </span>
            </p>
            <p className="text-[11px] text-rf-text-muted mt-0.5">
              {jobPostingOptions[postingIdx].tierName} plan
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-rf-text-muted uppercase tracking-wider mb-1">
              You save
            </p>
            <p className="text-2xl font-black text-rf-success">
              {savingsPercent}%
            </p>
            <p className="text-xs text-rf-text-muted">
              ${savings.toLocaleString()}/mo
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-rf-text-muted mt-4 text-center">
        Agencies charge per driver placed. RouteFlex is flat-rate — hire 2 or
        20, the price stays the same.
      </p>
    </div>
  );
}
