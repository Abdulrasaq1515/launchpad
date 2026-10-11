"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { HoldToConfirm } from "@/components/ui/HoldToConfirm";

/**
 * The inline "are you sure?" panel that every destructive admin action opens
 * in place, rather than a modal overlay. Six copies of this markup were spread
 * through `AdminPanel`; they only ever differed by accent, copy, and one
 * optional extra field.
 */

export type ConfirmAccent = "red" | "yellow" | "stellar" | "purple";

const ACCENTS: Record<ConfirmAccent, { wrap: string; heading: string }> = {
  red: { wrap: "border-danger/25 bg-danger-soft", heading: "text-danger" },
  yellow: { wrap: "border-warn/25 bg-warn-soft", heading: "text-warn" },
  stellar: { wrap: "border-info/25 bg-info-soft", heading: "text-info" },
  purple: { wrap: "border-line bg-sunken", heading: "text-ink" },
};

export interface ConfirmPanelProps {
  title: string;
  /** What the operator is agreeing to. Keep it concrete. */
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  accent?: ConfirmAccent;
  isLoading?: boolean;
  /** Blocks confirm while a typed phrase or similar gate is unmet. */
  confirmDisabled?: boolean;
  /** Extra input rendered between the message and the buttons. */
  children?: React.ReactNode;
  /** Show a success state on the confirm button instead of its label. */
  succeeded?: boolean;
  successLabel?: string;
  /**
   * Require the confirm button to be held rather than clicked.
   *
   * For the contract's one-way doors — the ones with no phrase to type and no
   * way back. A second click is not a decision; a deliberate hold is.
   */
  hold?: boolean;
}

export function ConfirmPanel({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  accent = "red",
  isLoading = false,
  confirmDisabled = false,
  children,
  succeeded = false,
  successLabel = "Done",
  hold = false,
}: ConfirmPanelProps) {
  const styles = ACCENTS[accent];

  return (
    <div
      role="group"
      aria-label={title}
      className={`space-y-3 rounded-[7px] border p-4 ${styles.wrap}`}
    >
      <p className={`text-[0.8125rem] font-medium ${styles.heading}`}>{title}</p>
      <p className="text-[0.8125rem] leading-relaxed text-body">{message}</p>
      {children}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        {hold && !succeeded ? (
          <HoldToConfirm
            className="flex-1"
            onConfirm={onConfirm}
            disabled={confirmDisabled || isLoading}
          >
            {confirmLabel}
          </HoldToConfirm>
        ) : (
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={confirmDisabled || isLoading}
          >
            {succeeded ? <ActionSuccess label={successLabel} /> : confirmLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Checkmark + label shown on a button after its action succeeds. */
export function ActionSuccess({ label = "Success" }: { label?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </span>
  );
}
