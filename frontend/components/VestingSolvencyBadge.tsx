"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  formatTokenAmount,
  type VestingSolvency,
} from "@/lib/vesting";

export function VestingSolvencyBadge({
  solvency,
  decimals = 7,
}: {
  solvency: VestingSolvency | null;
  decimals?: number;
}) {
  if (!solvency) {
    return (
      <div className="rounded-lg border border-line bg-sunken p-4">
        <p className="text-sm font-semibold text-ink">
          Solvency unavailable
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          This vesting contract does not expose live commitment accounting.
        </p>
      </div>
    );
  }

  const Icon = solvency.solvent ? ShieldCheck : AlertTriangle;
  const tone = solvency.solvent
    ? "border-ok/30 bg-ok-soft text-ok"
    : "border-danger/35 bg-danger-soft text-danger";
  const iconTone = solvency.solvent ? "text-ok" : "text-danger";
  const label = solvency.solvent ? "Solvent" : "Underfunded";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
          <div>
            <p className="text-sm font-semibold">{label}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-85">
              {solvency.solvent
                ? "Live token balance covers all active vesting commitments."
                : "Live token balance is below active vesting commitments."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-64">
          <div>
            <p className="opacity-70">Balance</p>
            <p className="data font-semibold">
              {formatTokenAmount(solvency.tokenBalance, decimals)}
            </p>
          </div>
          <div>
            <p className="opacity-70">Committed</p>
            <p className="data font-semibold">
              {formatTokenAmount(solvency.totalCommitted, decimals)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
