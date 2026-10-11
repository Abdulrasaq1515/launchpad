"use client";

import { Trash2 } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { truncateAddress } from "@/lib/stellar";

export interface AllowanceInfo {
  spenderAddress: string;
  amount: string;
  amountFormatted: string;
  expiresAt?: Date;
  expirationLedger?: number;
  isExpired?: boolean;
}

interface AllowanceCardProps {
  allowance: AllowanceInfo;
  onRevoke?: (spenderAddress: string) => void;
  isRevoking?: boolean;
}

/**
 * One allowance, as a row.
 *
 * An allowance is a standing permission to spend your tokens, so the row leads
 * with who holds it and how much, and states plainly whether it is still live.
 * An expired allowance is shown rather than hidden — it is the difference
 * between "this was revoked" and "this lapsed", which matters when auditing.
 */
export function AllowanceCard({ allowance, onRevoke, isRevoking }: AllowanceCardProps) {
  const expiry = allowance.expiresAt
    ? allowance.expiresAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : allowance.expirationLedger
      ? `Ledger ${allowance.expirationLedger.toLocaleString()}`
      : "—";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-[120ms] hover:bg-sunken">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="data truncate text-sm text-ink" title={allowance.spenderAddress}>
          {truncateAddress(allowance.spenderAddress)}
        </span>
        <CopyButton value={allowance.spenderAddress} label="Copy spender address" />
      </div>

      <div className="data text-sm text-ink">{allowance.amountFormatted}</div>

      <div className="flex min-w-[8rem] items-center gap-2">
        {allowance.isExpired ? (
          <span className="tag tag-neutral">Expired</span>
        ) : (
          <span className="tag tag-ok">
            <span className="dot" aria-hidden />
            Active
          </span>
        )}
        <span className="text-[0.75rem] text-muted">{expiry}</span>
      </div>

      {onRevoke && !allowance.isExpired && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(allowance.spenderAddress)}
          isLoading={isRevoking}
          className="text-danger hover:bg-danger-soft"
          aria-label={`Revoke allowance for ${allowance.spenderAddress}`}
        >
          {!isRevoking && <Trash2 className="h-3.5 w-3.5" aria-hidden />}
          Revoke
        </Button>
      )}
    </li>
  );
}
