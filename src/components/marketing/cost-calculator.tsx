"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

const driverTiers = [
  { label: "1–2", drivers: 2, agencyPerLocation: 1733 },
  { label: "3–5", drivers: 5, agencyPerLocation: 2600 },
  { label: "6–10", drivers: 10, agencyPerLocation: 4200 },
  { label: "10+", drivers: 12, agencyPerLocation: 5800 },
];

export function CostCalculator() {
  const [locations, setLocations] = useState(1);
  const [driverTier, setDriverTier] = useState(0);

  const agencyCost = locations * driverTiers[driverTier].agencyPerLocation;
  const routeflexCost = locations <= 1 ? 149 : locations <= 3 ? 299 : 599;

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
            How many locations?
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setLocations(n)}
                className={`flex-1 py-2.5 text-sm font-bold rounded-rf-md border transition-all ${
                  locations === n
                    ? "bg-rf-blue text-white border-rf-blue"
                    : "bg-rf-surface-page text-rf-text-secondary border-rf-border hover:border-rf-ink-300"
                }`}
              >
                {n}
                {n === 4 ? "+" : ""}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-rf-text-muted uppercase tracking-wider block mb-2">
            Drivers needed / month
          </label>
          <div className="flex gap-2">
            {driverTiers.map((tier, i) => (
              <button
                key={tier.label}
                onClick={() => setDriverTier(i)}
                className={`flex-1 py-2.5 text-sm font-bold rounded-rf-md border transition-all ${
                  driverTier === i
                    ? "bg-rf-blue text-white border-rf-blue"
                    : "bg-rf-surface-page text-rf-text-secondary border-rf-border hover:border-rf-ink-300"
                }`}
              >
                {tier.label}
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
        Agencies charge more as you hire more drivers. RouteFlex is flat-rate
        — hire 2 or 20, the price stays the same.
      </p>
    </div>
  );
}
