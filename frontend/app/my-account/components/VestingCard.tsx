"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { truncateAddress, type VestingScheduleInfo } from "@/lib/stellar";

export function VestingCard({
  schedule,
  contractId,
  currentLedger,
}: {
  schedule: VestingScheduleInfo;
  contractId: string;
  currentLedger: number;
}) {
  const t = useTranslations("myAccount");
  const totalAmount = BigInt(schedule.totalAmount);
  const released = BigInt(schedule.released);
  const unreleased = totalAmount - released;

  let vestPct = 0;
  if (currentLedger >= schedule.endLedger) {
    vestPct = 100;
  } else if (currentLedger > schedule.cliffLedger) {
    vestPct =
      ((currentLedger - schedule.cliffLedger) /
        (schedule.endLedger - schedule.cliffLedger)) *
      100;
  }

  const releasedPct =
    totalAmount > 0n ? Number((released * 100n) / totalAmount) : 0;

  const statusLabel = schedule.revoked
    ? t("revoked")
    : currentLedger < schedule.cliffLedger
      ? t("cliffPending")
      : currentLedger >= schedule.endLedger
        ? t("fullyVested")
        : t("vesting");

  const statusColor = schedule.revoked
    ? "text-danger bg-danger-soft border-danger/20"
    : currentLedger >= schedule.endLedger
      ? "text-ok bg-ok-soft border-ok/20"
      : "text-warn bg-warn-soft border-warn/20";

  return (
    <div className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-info" />
          <span className="text-xs text-muted" title={contractId}>
            {t("contractLabel", { contractId: truncateAddress(contractId, 6) })}
          </span>
          <CopyButton value={contractId} label="Copy contract ID" />
          {schedule.scheduleCount !== undefined &&
            schedule.scheduleCount > 1 && (
              <span className="rounded-full border border-info/20 bg-info-soft px-2 py-0.5 text-xs text-info">
                {t("scheduleOf", { current: (schedule.scheduleIndex ?? 0) + 1, count: schedule.scheduleCount })}
              </span>
            )}
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted">{t("total")}</p>
          <p className="data text-sm font-semibold text-ink">
            {totalAmount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("released")}</p>
          <p className="data text-sm font-semibold text-ok">
            {released.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("unreleased")}</p>
          <p className="data text-sm font-semibold text-warn">
            {unreleased.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{t("vested")}</span>
            <span>{vestPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-ink transition-all"
              style={{ width: `${Math.min(vestPct, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{t("released")}</span>
            <span>{releasedPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-linear-to-r from-green-500 to-green-400 transition-all"
              style={{ width: `${Math.min(releasedPct, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
