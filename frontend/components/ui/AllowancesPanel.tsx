"use client";

import { Loader2 } from "lucide-react";
import { AllowanceCard, type AllowanceInfo } from "./AllowanceCard";
import { EmptyState } from "./EmptyState";
import { Alert } from "./Alert";
import { KeyRound } from "lucide-react";

interface AllowancesPanelProps {
  allowances: AllowanceInfo[];
  loading?: boolean;
  error?: string | null;
  onRevoke?: (spenderAddress: string) => void;
  revokingSpender?: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
  columns: { spender: string; amount: string; status: string };
}

/**
 * The list of allowances on one token, with its own loading, error and empty
 * states so callers never have to reimplement them. Three separate list
 * components used to exist for this, each handling those states differently.
 */
export function AllowancesPanel({
  allowances,
  loading,
  error,
  onRevoke,
  revokingSpender,
  onRetry,
  emptyTitle,
  emptyDescription,
  columns,
}: AllowancesPanelProps) {
  if (loading) {
    return (
      <div className="panel flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading allowances…
      </div>
    );
  }

  if (error) {
    return (
      <Alert tone="danger" title="Could not load allowances">
        {error}
        {onRetry && (
          <button onClick={onRetry} className="mt-2 block underline underline-offset-2">
            Try again
          </button>
        )}
      </Alert>
    );
  }

  if (allowances.length === 0) {
    return <EmptyState icon={KeyRound} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex gap-x-4 border-b border-line px-4 py-2 text-[0.75rem] text-muted">
        <span className="flex-1">{columns.spender}</span>
        <span>{columns.amount}</span>
        <span className="min-w-[8rem]">{columns.status}</span>
      </div>
      <ul className="divide-y divide-line">
        {allowances.map((a) => (
          <AllowanceCard
            key={a.spenderAddress}
            allowance={a}
            onRevoke={onRevoke}
            isRevoking={revokingSpender === a.spenderAddress}
          />
        ))}
      </ul>
    </div>
  );
}
