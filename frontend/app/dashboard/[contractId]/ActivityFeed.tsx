"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ArrowRight,
  Loader2,
  ArrowLeftRight,
  Flame,
  Droplets,
  SnowflakeIcon,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
  Upload,
  CalendarPlus,
  CalendarClock,
  Layers,
  HandCoins,
  Ban,
  Eraser,
  UserCog,
  Rocket,
} from "lucide-react";
import {
  type TokenActivityInfo,
} from "@/lib/stellar";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { useSoroban } from "@/hooks/useSoroban";
import { useContractEvents } from "@/hooks/useContractEvents";

export default function ActivityFeed({
  accountId,
  vestingContractId,
}: {
  accountId: string;
  /**
   * Vesting contract holding this token's grants, when one is known. Its
   * events are folded into the same feed so a recipient has one audit trail
   * covering both the token and the contract that holds their tokens.
   */
  vestingContractId?: string;
}) {
  const { fetchAccountOperations } = useSoroban();
  const { events: liveEvents } = useContractEvents(accountId, {
    intervalMs: 10000,
    vestingContractId,
  });
  const [operations, setOperations] = useState<TokenActivityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use refs to avoid closure stale state in intervals
  const cursorRef = useRef<string | null>(null);
  cursorRef.current = nextCursor;

  const performFetch = useCallback(
    async (isLoadMore = false, isRefresh = false) => {
      try {
        if (!isLoadMore && !isRefresh) setLoading(true);
        if (isLoadMore) setLoadingMore(true);

        const cursorToUse = isLoadMore ? cursorRef.current : undefined;
        // Note: for a true auto-refresh we might want to fetch without cursor and prepend new ones,
        // but for simplicity we'll just reload the first page if it's a refresh interval.
        const fetchCursor = isRefresh ? undefined : cursorToUse;

        const { records, nextCursor: newCursor } = await fetchAccountOperations(
          accountId,
          // networkConfig,
          fetchCursor ?? undefined,
          10,
        );

        if (isLoadMore) {
          setOperations((prev) => [...prev, ...records]);
        } else {
          // First load or Refresh
          // If refresh, we might want to smartly prepend, but replacing is simpler for pagination reset.
          // Actually, just leaving it be or updating if head is different is better UX.
          setOperations(records);
        }

        if (!isRefresh || isLoadMore) {
          setNextCursor(newCursor);
        }
        setError(null);
      } catch (err) {
        console.error(err);
        if (!isRefresh) {
          setError("Failed to fetch activity feed.");
        }
      } finally {
        if (!isLoadMore && !isRefresh) setLoading(false);
        if (isLoadMore) setLoadingMore(false);
      }
    },
    [accountId, fetchAccountOperations],
  );

  // Initial load
  useEffect(() => {
    performFetch();
  }, [performFetch]);

  // Auto-refresh using live events from the polling hook
  useEffect(() => {
    if (liveEvents.length > 0) {
      setOperations((prev: TokenActivityInfo[]) => {
        const existingIds = new Set(prev.map((op: TokenActivityInfo) => op.id));
        const newOps = liveEvents.filter((op: TokenActivityInfo) => !existingIds.has(op.id));
        if (newOps.length === 0) return prev;
        return [...newOps, ...prev];
      });
    }
  }, [liveEvents]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-info" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-center text-sm text-danger">{error}</div>;
  }

  if (operations.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-muted">
        No token activity found for this account/contract.
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "mint":
        return <Droplets className="h-4 w-4 text-info" />;
      case "burn":
      case "clawback":
        return <Flame className="h-4 w-4 text-danger" />;
      case "transfer":
        return <ArrowLeftRight className="h-4 w-4 text-ok" />;
      case "freeze":
        return <SnowflakeIcon className="h-4 w-4 text-cyan-400" />;
      case "unfreeze":
        return <SnowflakeIcon className="h-4 w-4 text-teal-400" />;
      case "pause":
        return <PauseCircle className="h-4 w-4 text-warn" />;
      case "unpause":
        return <PlayCircle className="h-4 w-4 text-ok" />;
      case "authorize":
        return <ShieldCheck className="h-4 w-4 text-ok" />;
      case "rev_auth":
        return <ShieldOff className="h-4 w-4 text-warn" />;
      case "set_admin":
        return <UserCheck className="h-4 w-4 text-info" />;
      case "revoked":
        return <UserX className="h-4 w-4 text-danger" />;
      case "upgrade":
        return <Upload className="h-4 w-4 text-warn" />;

      // ── Vesting contract ──
      case "vesting:create":
        return <CalendarPlus className="h-4 w-4 text-info" />;
      case "vesting:batch":
        return <Layers className="h-4 w-4 text-info" />;
      case "vesting:release":
        return <HandCoins className="h-4 w-4 text-ok" />;
      case "vesting:revoke":
        return <Ban className="h-4 w-4 text-danger" />;
      case "vesting:clf_ext":
        return <CalendarClock className="h-4 w-4 text-warn" />;
      case "vesting:prune":
        return <Eraser className="h-4 w-4 text-muted" />;
      case "vesting:prop_adm":
        return <UserCog className="h-4 w-4 text-info" />;
      case "vesting:acc_adm":
        return <UserCheck className="h-4 w-4 text-info" />;
      case "vesting:revoked":
        return <UserX className="h-4 w-4 text-danger" />;
      case "vesting:init":
        return <Rocket className="h-4 w-4 text-warn" />;
      case "vesting:pause":
        return <PauseCircle className="h-4 w-4 text-warn" />;
      case "vesting:unpause":
        return <PlayCircle className="h-4 w-4 text-ok" />;
      case "vesting:upgrade":
        return <Upload className="h-4 w-4 text-warn" />;

      default:
        return <ArrowRight className="h-4 w-4 text-muted" />;
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case "mint":          return "Mint";
      case "burn":          return "Burn";
      case "clawback":      return "Clawback";
      case "transfer":      return "Transfer";
      case "freeze":        return "Account frozen";
      case "unfreeze":      return "Account unfrozen";
      case "pause":         return "Token paused";
      case "unpause":       return "Token unpaused";
      case "authorize":     return "Authorized";
      case "rev_auth":      return "Authorization revoked";
      case "set_admin":     return "Admin set";
      case "revoked":       return "Admin revoked";
      case "upgrade":       return "Contract upgraded";

      // ── Vesting contract ──
      // Named so a reader can tell them apart from the token's own events:
      // both contracts emit init, pause, unpause, prop_adm, revoked, upgrade.
      case "vesting:create":   return "Vesting schedule created";
      case "vesting:batch":    return "Vesting schedules created (batch)";
      case "vesting:release":  return "Vested tokens released";
      case "vesting:revoke":   return "Vesting revoked";
      case "vesting:clf_ext":  return "Vesting cliff extended";
      case "vesting:prune":    return "Vesting recipient pruned";
      case "vesting:prop_adm": return "Vesting admin proposed";
      case "vesting:acc_adm":  return "Vesting admin accepted";
      case "vesting:revoked":  return "Vesting admin revoked";
      case "vesting:init":     return "Vesting contract initialized";
      case "vesting:pause":    return "Vesting paused";
      case "vesting:unpause":  return "Vesting unpaused";
      case "vesting:upgrade":  return "Vesting contract upgraded";

      default:              return "Other";
    }
  };

  const getStyleForType = (type: string) => {
    switch (type) {
      case "mint":
        return "text-info bg-info-soft border-info/20";
      case "burn":
      case "clawback":
      case "revoked":
      case "vesting:revoke":
      case "vesting:revoked":
        return "text-danger bg-danger-soft border-danger/20";
      case "transfer":
      case "unpause":
      case "authorize":
      case "vesting:release":
      case "vesting:unpause":
        return "text-ok bg-ok-soft border-ok/20";
      case "vesting:create":
      case "vesting:batch":
        return "text-info bg-info-soft border-info/20";
      case "vesting:clf_ext":
        return "text-warn bg-warn-soft border-warn/20";
      case "vesting:prop_adm":
      case "vesting:acc_adm":
        return "text-info bg-info-soft border-info/20";
      case "vesting:init":
      case "vesting:upgrade":
        return "text-warn bg-warn-soft border-warn/25";
      case "freeze":
        return "text-cyan-400 bg-cyan-400/10 border-cyan-400/20";
      case "unfreeze":
        return "text-teal-400 bg-teal-400/10 border-teal-400/20";
      case "pause":
      case "vesting:pause":
        return "text-warn bg-warn-soft border-warn/20";
      case "rev_auth":
        return "text-warn bg-warn-soft border-warn/20";
      case "set_admin":
        return "text-info bg-info-soft border-info/20";
      case "upgrade":
        return "text-warn bg-warn-soft border-warn/25";
      default:
        return "text-muted bg-gray-400/10 border-gray-400/20";
    }
  };

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line/5 bg-sunken">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted">
                Type
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted">
                From
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted">
                To
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted">
                Time
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted">
                Tx
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/5">
            {operations.map((op, i) => (
              <tr
                key={`${op.id}-${i}`}
                className="transition-colors hover:bg-white/2"
              >
                <td className="px-4 py-3">
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStyleForType(op.type)}`}
                  >
                    {getTypeIcon(op.type)}
                    {getTypeLabel(op.type)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right data text-ink">
                  {op.amount !== "-" ? op.amount : "-"}
                </td>
                <td className="px-4 py-3 data text-xs text-info">
                  {op.subject ? (
                    <ExplorerLink
                      type="account"
                      identifier={op.subject}
                      truncate={true}
                      truncateChars={5}
                      showCopy={false}
                    />
                  ) : op.from !== "-" ? (
                    <ExplorerLink
                      type="account"
                      identifier={op.from}
                      truncate={true}
                      truncateChars={5}
                      showCopy={false}
                    />
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 data text-xs text-info">
                  {op.to !== "-" ? (
                    <ExplorerLink
                      type="account"
                      identifier={op.to}
                      truncate={true}
                      truncateChars={5}
                      showCopy={false}
                    />
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted">
                  {new Date(op.timestamp).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <ExplorerLink
                    type="tx"
                    identifier={op.txHash}
                    truncate={false}
                    showCopy={false}
                    displayText="View"
                    className="inline-flex items-center gap-1 rounded text-xs"
                    label="View transaction on Stellar Expert"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="border-t border-line/5 p-4 text-center">
          <button
            onClick={() => performFetch(true)}
            disabled={loadingMore}
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
