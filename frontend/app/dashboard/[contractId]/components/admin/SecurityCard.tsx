"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { UseAdminActionResult } from "../../hooks/useAdminAction";
import { AccountActionForm } from "./AccountActionForm";
import { AdminCard } from "./AdminCard";
import { ActionSuccess, ConfirmPanel } from "./ConfirmPanel";

/**
 * Security controls: the token-wide circuit breaker and per-account freeze.
 *
 * Pausing halts every holder at once, so it is the blunt instrument of last
 * resort. Freezing quarantines a single compromised or sanctioned account —
 * which is the whole reason the contract has `freeze_account` — so an admin
 * facing one bad holder no longer has to choose between stopping the entire
 * token and dropping to the Soroban CLI.
 */
export function SecurityCard({
  admin,
  disabled,
  locked,
  paused,
  onPausedChanged,
  onFrozenChanged,
}: {
  admin: UseAdminActionResult;
  disabled: boolean;
  locked: boolean;
  paused: boolean;
  onPausedChanged: (paused: boolean) => void;
  /** Lets the holders table re-read frozen state after a change. */
  onFrozenChanged?: () => void;
}) {
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);

  const togglePause = async () => {
    const action = paused ? "unpause" : "pause";
    if (await admin.run(action, {})) {
      onPausedChanged(!paused);
      setShowPauseConfirm(false);
    }
  };

  return (
    <AdminCard
      title="Security Controls"
      icon={AlertTriangle}
      accent="yellow"
      description="Halt the whole token, or quarantine a single account."
    >
      <p className="text-[10px] text-warn font-bold mb-3">
        Circuit Breaker
      </p>
      {paused ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Token is paused — mint, burn, transfer, and clawback are halted.
          </div>
          <Button
            type="button"
            className="w-full bg-ok hover:bg-green-700 border-none shadow-green-600/20"
            onClick={togglePause}
            isLoading={admin.loading === "unpause"}
            disabled={disabled || locked}
          >
            {admin.success === "unpause" ? (
              <ActionSuccess label="Unpaused" />
            ) : (
              "Unpause Token"
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-ok/20 bg-ok-soft px-4 py-3 text-sm text-ok">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            Token is active — all operations are running normally.
          </div>

          {!showPauseConfirm ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full border-warn/20 text-warn hover:border-warn/40"
              disabled={disabled || locked}
              onClick={() => setShowPauseConfirm(true)}
            >
              Pause Token
            </Button>
          ) : (
            <ConfirmPanel
              accent="yellow"
              title="Pause token?"
              message="This will halt all mint, burn, transfer, and clawback operations until unpaused. Only token holders can still self-burn."
              confirmLabel="Confirm Pause"
              successLabel="Paused"
              succeeded={admin.success === "pause"}
              isLoading={admin.loading === "pause"}
              onCancel={() => setShowPauseConfirm(false)}
              onConfirm={togglePause}
            />
          )}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-line">
        <p className="text-[10px] text-warn font-bold mb-2">
          Freeze Account
        </p>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          A frozen account cannot send or burn its tokens, but can still
          receive them. Use this to quarantine one holder instead of pausing
          the whole token.
        </p>
        <AccountActionForm
          admin={admin}
          disabled={disabled || locked}
          checkMethod="is_frozen"
          checkLabel="Check"
          describeCheck={(frozen) =>
            frozen
              ? { tone: "negative", text: "is frozen." }
              : { tone: "positive", text: "is not frozen." }
          }
          onCompleted={onFrozenChanged}
          actions={[
            {
              action: "freeze",
              label: "Freeze",
              successLabel: "Frozen",
              variant: "secondary",
              className:
                "border-warn/20 text-warn hover:border-warn/40",
              confirm: {
                accent: "yellow",
                title: "Freeze this account?",
                message:
                  "The account will be unable to send, burn or receive tokens until you unfreeze it.",
                confirmLabel: "Freeze account",
              },
            },
            {
              action: "unfreeze",
              label: "Unfreeze",
              successLabel: "Unfrozen",
              variant: "secondary",
            },
          ]}
        />
      </div>
    </AdminCard>
  );
}
