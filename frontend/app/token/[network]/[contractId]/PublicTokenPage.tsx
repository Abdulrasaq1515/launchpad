"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Copy,
  Check,
  ArrowUpDown,
  AlertCircle,
  Loader2,
  Lock,
  Share2,
  ExternalLink,
} from "lucide-react";
import {
  truncateAddress,
  fetchWalletTokenState,
  type TokenInfo,
  type TokenHolder,
  type WalletTokenState,
} from "@/lib/stellar";
import { useSoroban } from "@/hooks/useSoroban";
import { useTranslations } from "next-intl";
import { useNetwork } from "@/app/providers/NetworkProvider";
import { useWallet } from "@/app/hooks/useWallet";
import { useToast } from "@/app/providers/ToastProvider";
import { TokenStatusBanner } from "@/components/TokenStatusBanner";
import { ContractVerificationBadge } from "@/components/ui/ContractVerificationBadge";
import InvalidTokenContract from "../../../components/InvalidTokenContract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SortField = "address" | "balance" | "sharePercent";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (e.g. non-HTTPS)
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="ml-2 inline-flex items-center rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-info/30 hover:text-info"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-ok" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ShareButton({
  // contractId,
  tokenInfo,
}: {
  contractId: string;
  tokenInfo: TokenInfo | null;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const shareText = tokenInfo
      ? `Check out ${tokenInfo.name} (${tokenInfo.symbol}) token on SoroPad! Total Supply: ${tokenInfo.totalSupply}`
      : `Check out this token on SoroPad!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: tokenInfo
            ? `${tokenInfo.name} (${tokenInfo.symbol})`
            : "Token Details",
          text: shareText,
          url: url,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        toast.show({
          title: "Share failed",
          message: err instanceof Error ? err.message : "Could not open share dialog",
          variant: "error",
        });
      }
    } else {
      // Fallback to copying URL
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API may be unavailable
      }
    }
  }, [tokenInfo, toast]);

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm font-medium text-info transition-colors hover:bg-info-soft"
      aria-label={copied ? "Link copied!" : "Share this token"}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Link copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          Share
        </>
      )}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted">
        {label}
      </span>
      <span className="truncate text-lg font-semibold text-ink">{value}</span>
    </div>
  );
}

function LoadingState() {
  const t = useTranslations("token");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-info" />
      <p className="text-sm text-muted">{t("fetchingData")}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("token");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="h-10 w-10 text-danger" />
      <p className="max-w-md text-muted">{message}</p>
      <button onClick={onRetry} className="btn-secondary px-4 py-2 text-sm">
        {t("retry")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holders table
// ---------------------------------------------------------------------------

function HoldersTable({
  holders,
  emptyMessage = "No holder data available.",
}: {
  holders: TokenHolder[];
  emptyMessage?: string;
}) {
  const t = useTranslations("token");
  const [sortField, setSortField] = useState<SortField>("balance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    return [...holders].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "address":
          cmp = a.address.localeCompare(b.address);
          break;
        case "balance":
          cmp = parseFloat(a.balance) - parseFloat(b.balance);
          break;
        case "sharePercent":
          cmp = a.sharePercent - b.sharePercent;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [holders, sortField, sortDir]);

  if (holders.length === 0) {
    return (
      <div className="panel p-8 text-center text-muted">
        <p>{emptyMessage}</p>
        <p className="mt-1 text-xs">
          {t("sorobanNote")}
        </p>
      </div>
    );
  }

  const thClass =
    "px-4 py-3 text-left text-xs font-medium text-muted cursor-pointer select-none hover:text-body transition-colors";

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-line/5">
              <th
                className={thClass}
                onClick={() => toggleSort("address")}
                aria-sort={
                  sortField === "address"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <span className="inline-flex items-center gap-1">
                  Address
                  <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
              <th
                className={`${thClass} text-right`}
                onClick={() => toggleSort("balance")}
                aria-sort={
                  sortField === "balance"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Balance
                  <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
              <th
                className={`${thClass} text-right`}
                onClick={() => toggleSort("sharePercent")}
                aria-sort={
                  sortField === "sharePercent"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <span className="inline-flex items-center justify-end gap-1">
                  % Share
                  <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((holder, i) => (
              <tr
                key={holder.address}
                className={`border-b border-line/5 transition-colors hover:bg-white/2 ${
                  i % 2 === 0 ? "bg-white/1" : ""
                }`}
              >
                <td className="px-4 py-3 data text-xs text-info">
                  <span className="hidden sm:inline">{holder.address}</span>
                  <span className="sm:hidden">
                    {truncateAddress(holder.address, 6)}
                  </span>
                  <CopyButton text={holder.address} />
                </td>
                <td className="px-4 py-3 text-right data text-ink">
                  {holder.balance}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-sunken sm:block">
                      <div
                        className="h-full rounded-full bg-ink"
                        style={{
                          width: `${Math.min(holder.sharePercent, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="data text-body">
                      {holder.sharePercent.toFixed(2)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PublicTokenPage({
  contractId,
  network,
}: {
  contractId: string;
  network: string;
}) {
  const t = useTranslations("token");
  const tc = useTranslations("common");
  const { fetchTokenInfo, fetchTopHolders, validateTokenContract } = useSoroban();
  const { networkConfig, setNetwork } = useNetwork();
  const { publicKey, connected } = useWallet();
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [holders, setHolders] = useState<TokenHolder[]>([]);
  const [walletState, setWalletState] = useState<WalletTokenState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    setNetwork(network === "mainnet" ? "mainnet" : "testnet");
  }, [network, setNetwork]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsValidToken(null);

    try {
      // First validate the token contract
      const validation = await validateTokenContract(contractId);
      
      if (!validation.isValid) {
        setIsValidToken(false);
        setError(validation.error || "Invalid token contract");
        setLoading(false);
        return;
      }

      setIsValidToken(true);

      // If validation passes, fetch token info
      const info = await fetchTokenInfo(contractId);
      setTokenInfo(info);

      // Attempt to load holders (best-effort for classic-wrapped assets)
      const holderData = await fetchTopHolders(contractId);
      setHolders(holderData);
    } catch (err) {
      // If fetchTokenInfo fails, it might be a validation issue
      if (err instanceof Error && err.message.includes("Invalid token contract")) {
        setIsValidToken(false);
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch token data. Please check the contract ID and try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [contractId, fetchTokenInfo, fetchTopHolders, validateTokenContract]);

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

  if (loading) return <LoadingState />;
  
  // Show invalid token component if validation failed
  if (isValidToken === false) {
    return <InvalidTokenContract contractId={contractId} error={error || undefined} />;
  }
  
  if (error) return <ErrorState message={error} onRetry={loadData} />;
  if (!tokenInfo) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink">
              {tokenInfo.name}{" "}
              <span className="text-info">({tokenInfo.symbol})</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="data text-xs">
                <span className="hidden md:inline">{contractId}</span>
                <span className="md:hidden">
                  {truncateAddress(contractId, 8)}
                </span>
              </span>
              <CopyButton text={contractId} />
              <a
                href={`https://stellar.expert/explorer/${networkConfig.network}/contract/${contractId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-info hover:text-info transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Explorer</span>
              </a>
            </div>
          </div>
          <ShareButton contractId={contractId} tokenInfo={tokenInfo} />
        </div>
      </div>

      <TokenStatusBanner tokenInfo={tokenInfo} walletState={walletState} />

      {/* Token info grid */}
      {/* Contract verification */}
      <section aria-label="Contract verification" className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <ContractVerificationBadge
            contractId={contractId}
            networkConfig={networkConfig}
            isLocked={tokenInfo.isLocked}
          />
          {tokenInfo.isLocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">
              <Lock className="h-3 w-3" />
              {t("immutable")}
            </span>
          )}
        </div>
      </section>

      <section aria-label="Token details" className="mb-10">
        <h2 className="mb-4 text-sm font-medium text-muted">
          {t("tokenDetails")}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <InfoCard label={t("name")} value={tokenInfo.name} />
          <InfoCard label={t("symbol")} value={tokenInfo.symbol} />
          <InfoCard label={t("decimals")} value={String(tokenInfo.decimals)} />
          <InfoCard label={t("totalSupply")} value={tokenInfo.totalSupply} />
          <InfoCard label={t("circulating")} value={tokenInfo.circulatingSupply} />
          <InfoCard label={t("admin")} value={truncateAddress(tokenInfo.admin)} />
        </div>
      </section>

      {/* Top holders */}
      <section aria-label={t("holders")}>
        <h2 className="mb-4 text-sm font-medium text-muted">
          {t("holders")}
        </h2>
        <HoldersTable
          holders={holders}
          emptyMessage={
            contractId.startsWith("C")
              ? t("sorobanEmpty")
              : t("noHolderData")
          }
        />
      </section>

      {/* Footer */}
      <section className="mt-10 pt-8 border-t border-line/5">
        <div className="text-center">
          <p className="text-sm text-muted mb-4">
            {t("viewInDashboard")}
          </p>
          <a
            href={`/dashboard/${contractId}`}
            className="inline-flex items-center gap-2 rounded-md border border-info/30 bg-info-soft px-4 py-2 text-sm font-medium text-info transition-colors hover:bg-info-soft"
          >
            {t("openInDashboard")}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  );
}
