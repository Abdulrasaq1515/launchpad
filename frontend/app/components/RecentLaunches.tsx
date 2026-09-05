"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useNetwork } from "../providers/NetworkProvider";
import { Loader2, Coins } from "lucide-react";
import Link from "next/link";
import type { RecentToken } from "@/lib/recentTokens";
import { truncateAddress } from "@/lib/stellar";
import { ContractVerificationBadge } from "@/components/ui/ContractVerificationBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Page } from "@/components/ui/Page";

function timeAgo(iso: string): string {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * The live launch feed.
 *
 * A table rather than a grid of cards: these rows are compared against each
 * other — which is newest, which is busiest, which is verified — and columns
 * are what makes that comparison possible. Cards would give each token its own
 * box and force the eye to re-find every value.
 */
export function RecentLaunches() {
  const t = useTranslations("recentLaunches");
  const { networkConfig } = useNetwork();
  const [tokens, setTokens] = useState<RecentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tokens/recent?network=${networkConfig.network}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTokens(Array.isArray(data) ? data : []);
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [networkConfig.network, t]);

  useEffect(() => {
    load();
  }, [load]);

  const maxScore = tokens.length ? Math.max(...tokens.map((x) => x.activityScore)) : 0;
  const activeThreshold = Math.max(5, Math.floor(maxScore * 0.6));

  return (
    <Page wide>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {t("title")}
            {!loading && tokens.length > 0 && (
              <span className="dot dot-live" aria-hidden />
            )}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("description")}</p>
        </div>
      </div>

      {loading && (
        <div className="panel flex items-center justify-center gap-2 py-14 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("loading")}
        </div>
      )}

      {!loading && error && (
        <div className="panel px-5 py-10 text-center">
          <p className="text-sm text-muted">{error}</p>
          <button onClick={load} className="btn btn-secondary mt-3">
            {t("retry")}
          </button>
        </div>
      )}

      {!loading && !error && tokens.length === 0 && (
        <EmptyState
          icon={Coins}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actionLabel={t("emptyAction")}
          actionHref="/deploy"
        />
      )}

      {!loading && !error && tokens.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.75rem] text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("token")}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t("supply")}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">{t("contract")}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">{t("deployed")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">{t("status")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tokens.map((token) => (
                  <tr
                    key={token.contractId}
                    className="group transition-colors duration-[120ms] hover:bg-sunken"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/${token.contractId}`}
                        className="flex items-center gap-3 outline-none"
                      >
                        {/* Initials, not a generated avatar: the symbol is the
                            token's real identifier and a colour-hashed blob
                            would invent an identity it does not have. */}
                        <span
                          aria-hidden
                          className="data flex h-7 w-7 flex-none items-center justify-center rounded-[6px] border border-line bg-sunken text-[0.6875rem] font-medium text-body"
                        >
                          {token.symbol.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink group-hover:underline">
                            {token.name}
                          </span>
                          <span className="block text-[0.75rem] text-muted">
                            {token.symbol}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="data whitespace-nowrap px-4 py-3 text-right text-body">
                      {token.totalSupply}
                    </td>
                    <td className="data hidden whitespace-nowrap px-4 py-3 text-[0.8125rem] text-muted sm:table-cell">
                      {truncateAddress(token.contractId)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-[0.8125rem] text-muted md:table-cell">
                      {token.deployedAt ? timeAgo(token.deployedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {token.activityScore >= activeThreshold && (
                          <span className="tag tag-ok">
                            <span className="dot" aria-hidden />
                            {t("active")}
                          </span>
                        )}
                        <ContractVerificationBadge
                          contractId={token.contractId}
                          networkConfig={networkConfig}
                          compact
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Page>
  );
}
