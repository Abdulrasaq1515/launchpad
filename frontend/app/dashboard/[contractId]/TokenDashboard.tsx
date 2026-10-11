"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download } from "lucide-react";
import {
  truncateAddress,
  fetchWalletTokenState,
  type TokenInfo,
  type TokenHolder,
  type SupplyBreakdown,
  type WalletTokenState,
} from "@/lib/stellar";
import { useSoroban } from "@/hooks/useSoroban";
import { TokenStatusBanner } from "@/components/TokenStatusBanner";
import VestingProgress from "./VestingProgress";
import TransactionHistory from "./TransactionHistory";
import SupplyBreakdownChart from "@/components/charts/SupplyBreakdownChart";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { SafeExternalLink } from "@/components/ui/SafeExternalLink";
import ActivityFeed from "./ActivityFeed";
import { TransferPanel } from "./components/TransferPanel";
import { UserPanel } from "./components/UserPanel";
import { AdminPanel } from "./components/AdminPanel";
import { useWallet } from "@/app/hooks/useWallet";
import { useNetwork } from "@/app/providers/NetworkProvider";
import { HoldersTable, exportHoldersCsv } from "./components/HoldersTable";
import { InfoCard } from "./components/InfoCard";
import {
  ErrorState,
  LoadingState,
  NotATokenState,
} from "./components/DashboardUi";
import { useContractRead } from "./hooks/useContractRead";
import { getTrackedDeployments } from "@/lib/deployments";
import { useFrozenAccounts } from "./hooks/useFrozenAccounts";

// ---------------------------------------------------------------------------
// Main dashboard component
// ---------------------------------------------------------------------------

export default function TokenDashboard({ contractId }: { contractId: string }) {
  const t = useTranslations("dashboard");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [holders, setHolders] = useState<TokenHolder[]>([]);
  const [supplyBreakdown, setSupplyBreakdown] =
    useState<SupplyBreakdown | null>(null);
  const [walletState, setWalletState] = useState<WalletTokenState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { publicKey, connected } = useWallet();

  // When Mercury is unavailable the indexer falls back to a bounded RPC
  // window (~1000 ledgers, roughly 83 minutes). Track the window's start
  // ledger so the UI can state that the history shown is truncated rather
  // than presenting it as the token's complete history.
  const [historyStartLedger, setHistoryStartLedger] = useState<
    number | undefined
  >();

  // The vesting contract holding this token's grants, if the deployment
  // recorded one. `TrackedDeployment.vestingContractId` exists for exactly
  // this; when it is absent the feed simply shows token events as before.
  const [vestingContractId, setVestingContractId] = useState<
    string | undefined
  >();

  useEffect(() => {
    if (!publicKey) {
      setVestingContractId(undefined);
      return;
    }
    const tracked = getTrackedDeployments(publicKey).find(
      (deployment) => deployment.contractId === contractId,
    );
    setVestingContractId(tracked?.vestingContractId);
  }, [publicKey, contractId]);
  const { networkConfig } = useNetwork();
  const { fetchTokenInfo, fetchTopHolders, fetchSupplyBreakdown, fetchTransactionHistory } =
    useSoroban();

  // Frozen state costs one simulation per holder, so only read it for the
  // admin — they are the only viewer who can act on it.
  const isAdmin = !!publicKey && tokenInfo?.admin === publicKey;
  const { read } = useContractRead(contractId);
  const { frozen: frozenAddresses, refresh: refreshFrozen } =
    useFrozenAccounts(
      read,
      holders.map((h) => h.address),
      isAdmin,
    );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const info = await fetchTokenInfo(contractId);
      setTokenInfo(info);

      // Attempt to load holders (best-effort for classic-wrapped assets)
      const holderData = await fetchTopHolders(contractId);
      setHolders(holderData);

      // Fetch supply breakdown
      try {
        const breakdown = await fetchSupplyBreakdown(contractId);
        setSupplyBreakdown(breakdown);
      } catch (supplyError) {
        console.error("Failed to fetch supply breakdown", supplyError);
        // Non-fatal for the dashboard – chart will simply be hidden.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch token data. Please check the contract ID and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [contractId, fetchTokenInfo, fetchTopHolders, fetchSupplyBreakdown]);

  // Probe the indexer once to learn whether the transaction history is
  // served from a bounded RPC fallback window. `fetchTransactionHistory`
  // returns the window's start ledger when it is truncated; when Mercury
  // is available it is undefined and the history is complete.
  useEffect(() => {
    let cancelled = false;
    fetchTransactionHistory(contractId)
      .then((result) => {
        if (!cancelled) setHistoryStartLedger(result.window.startLedger ?? undefined);
      })
      .catch(() => {
        if (!cancelled) setHistoryStartLedger(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setWalletState(null);
      return;
    }
    let cancelled = false;
    fetchWalletTokenState(contractId, publicKey, networkConfig)
      .then((state) => {
        if (!cancelled) setWalletState(state);
      })
      .catch(() => {
        if (!cancelled) setWalletState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId, publicKey, connected, networkConfig]);

  const isInvalidToken = error?.startsWith("Invalid token contract:") ?? false;

  if (loading) return <LoadingState />;
  if (isInvalidToken) return <NotATokenState contractId={contractId} />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;
  if (!tokenInfo) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink">
          {tokenInfo.name}{" "}
          <span className="text-info">({tokenInfo.symbol})</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="text-xs text-muted">
            {t("sections.contractId")}:
          </span>
          <ExplorerLink
            type="contract"
            identifier={contractId}
            truncate={true}
            truncateChars={8}
            showCopy={true}
          />
        </div>
      </div>

      <TokenStatusBanner tokenInfo={tokenInfo} walletState={walletState} />

      {historyStartLedger !== undefined && (
        <div
          role="status"
          className="mb-8 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">
              Showing a truncated transaction history
            </p>
            <p className="mt-1 text-amber-200/80">
              The indexer is unavailable, so only events from ledger{" "}
              {historyStartLedger} onward (roughly the last 83 minutes) are
              shown. Full history requires the indexer.
            </p>
          </div>
        </div>
      )}

      {/* Token info grid */}
      <section aria-label={t("sections.tokenDetails")} className="mb-10">
        <h2 className="mb-4 text-sm font-medium text-muted">
          {t("sections.tokenDetails")}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <InfoCard label="Name" value={tokenInfo.name} />
          <InfoCard label="Symbol" value={tokenInfo.symbol} />
          <InfoCard label="Decimals" value={String(tokenInfo.decimals)} />
          <InfoCard label="Total Supply" value={tokenInfo.totalSupply} />
          <InfoCard label="Circulating" value={tokenInfo.circulatingSupply} />
          <InfoCard
            label="Admin"
            value={truncateAddress(tokenInfo.admin)}
            copyValue={tokenInfo.admin}
            isAddress={true}
          />
          {tokenInfo.complianceNode && (
            <InfoCard
              label="Compliance Node"
              value={truncateAddress(tokenInfo.complianceNode)}
              copyValue={tokenInfo.complianceNode}
              isAddress={true}
            />
          )}
          {tokenInfo.authorizationRequired !== undefined && (
            <InfoCard
              label="Auth Required"
              value={tokenInfo.authorizationRequired ? "Yes" : "No"}
            />
          )}
          {tokenInfo.authorizationRevocable !== undefined && (
            <InfoCard
              label="Auth Revocable"
              value={tokenInfo.authorizationRevocable ? "Yes" : "No"}
            />
          )}
        </div>
      </section>

      {/* Metadata URI */}
      {tokenInfo.contractUri && (
        <section aria-label="Metadata URI" className="mb-10">
          <h2 className="mb-4 text-sm font-medium text-muted">
            Metadata
          </h2>
          <div className="panel flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">
                URI
              </span>
            </div>
            <SafeExternalLink
              href={tokenInfo.contractUri}
              className="truncate text-lg font-semibold text-info hover:text-info transition-colors"
              blockedClassName="truncate text-lg font-semibold text-muted cursor-not-allowed"
            >
              {tokenInfo.contractUri}
            </SafeExternalLink>
          </div>
        </section>
      )}

      {/* User Actions Panel (Burn Tokens) */}
      <UserPanel contractId={contractId} decimals={tokenInfo.decimals} />

      {/* Admin Panel (Mint, Burn, Vesting, Transfer Admin) */}
      {publicKey && tokenInfo.admin === publicKey && (
        <AdminPanel
          contractId={contractId}
          maxSupply={tokenInfo.maxSupply}
          totalSupply={tokenInfo.totalSupply}
          decimals={tokenInfo.decimals}
          tokenSymbol={tokenInfo.symbol}
          authorizationRequired={tokenInfo.authorizationRequired}
          authorizationRevocable={tokenInfo.authorizationRevocable}
          onFrozenChanged={refreshFrozen}
        />
      )}

      {/* Supply Breakdown Chart */}
      {supplyBreakdown && (
        <section aria-label="Supply breakdown" className="mb-10">
          <SupplyBreakdownChart
            data={{
              circulating: supplyBreakdown.circulating,
              locked: supplyBreakdown.locked,
              burned: supplyBreakdown.burned,
              burnedAvailable: supplyBreakdown.burnedAvailable,
              total: supplyBreakdown.total,
            }}
            symbol={tokenInfo.symbol}
            decimals={tokenInfo.decimals}
          />
        </section>
      )}

      {/* Top holders */}
      <section aria-label={t("sections.topHolders")}>
        <div className="mb-4">
          <h2 className="text-sm font-medium text-muted">
            {t("sections.topHolders")}
          </h2>
        </div>
        <HoldersTable
          holders={holders}
          frozenAddresses={isAdmin ? frozenAddresses : undefined}
          emptyMessage={
            contractId.startsWith("C")
              ? "This is a Soroban-native token, so Horizon cannot enumerate its holders."
              : "No holder data available."
          }
        />
      </section>

      {/* Vesting schedule */}
      <section aria-label={t("sections.vestingSchedule")} className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-muted">
          {t("sections.vestingSchedule")}
        </h2>
        <VestingProgress decimals={tokenInfo.decimals} />
      </section>

      {/* Transaction History */}
      <section
        aria-label={t("sections.transactionHistory")}
        className="mt-16 border-t border-line/5 pt-10"
      >
        <TransactionHistory
          contractId={contractId}
          decimals={tokenInfo.decimals}
          symbol={tokenInfo.symbol}
        />
      </section>

      {/* Token Activity Feed */}
      <section aria-label={t("sections.tokenActivity")} className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-muted">
          {t("sections.tokenActivity")}
        </h2>
        <ActivityFeed
          accountId={contractId}
          vestingContractId={vestingContractId}
        />
      </section>

      {/* Transfer Tokens Panel */}
      <TransferPanel
        contractId={contractId}
        tokenSymbol={tokenInfo.symbol}
        tokenDecimals={tokenInfo.decimals}
        tokenInfo={tokenInfo}
        walletState={walletState}
      />
    </div>
  );
}
