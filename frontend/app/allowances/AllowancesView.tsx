"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { useWallet } from "@/app/hooks/useWallet";
import { useNetwork } from "@/app/providers/NetworkProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { AllowanceManager } from "@/components/AllowanceManager";
import { AllowancesPanel } from "@/components/ui/AllowancesPanel";
import type { AllowanceInfo } from "@/components/ui/AllowanceCard";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  buildRevokeAllowanceTransaction,
  fetchApprovedSpendersFromEvents,
  fetchTokenDecimals,
  fetchAllowanceWithExpiration,
  formatTokenAmount,
  submitTransaction,
} from "@/lib/stellar";
import { CONTRACT_ID_REGEX } from "@/lib/contractValidation";
import { Wallet } from "lucide-react";

/**
 * Allowances, in one place.
 *
 * This replaced two routes built on five overlapping components — granting
 * lived on one page, revoking on the other, and the two disagreed about what
 * an expired allowance was. Granting and revoking are the same job seen from
 * two ends, so they share a screen and a single source of state.
 */
export function AllowancesView({ contractId: initial = "" }: { contractId?: string }) {
  const t = useTranslations("allowancesPage");
  const { connected, publicKey, signTransaction, connect } = useWallet();
  const { networkConfig } = useNetwork();
  const toast = useToast();

  const [contractId, setContractId] = useState(initial);
  const [allowances, setAllowances] = useState<AllowanceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!CONTRACT_ID_REGEX.test(contractId.trim()) || !publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const id = contractId.trim();
      const decimals = await fetchTokenDecimals(id, networkConfig);
      const spenders = await fetchApprovedSpendersFromEvents({
        contractId: id,
        ownerAddress: publicKey,
        config: networkConfig,
        maxPages: 5,
      });

      const results = await Promise.all(
        spenders.map(async (spenderAddress) => {
          const { amount, expirationLedger } = await fetchAllowanceWithExpiration(
            id,
            publicKey,
            spenderAddress,
            networkConfig,
          );
          return {
            spenderAddress,
            amount: amount.toString(),
            amountFormatted: formatTokenAmount(amount.toString(), decimals),
            expirationLedger: expirationLedger > 0 ? expirationLedger : undefined,
            isExpired: amount <= BigInt(0),
          } satisfies AllowanceInfo;
        }),
      );

      setAllowances(results.filter((a) => a.amount !== "0"));
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allowances");
    } finally {
      setLoading(false);
    }
  }, [contractId, publicKey, networkConfig]);

  const revoke = async (spenderAddress: string) => {
    if (!connected || !publicKey) {
      await connect();
      return;
    }
    setRevoking(spenderAddress);
    try {
      const xdr = await buildRevokeAllowanceTransaction({
        tokenContractId: contractId.trim(),
        ownerAddress: publicKey,
        spenderAddress,
        config: networkConfig,
      });
      const signed = await signTransaction(xdr);
      await submitTransaction(signed, networkConfig);
      toast.show({ title: "Allowance revoked", variant: "success" });
      await load();
    } catch (err) {
      toast.show({
        title: t("revokeFailed"),
        message: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setRevoking(null);
    }
  };

  const canLoad = CONTRACT_ID_REGEX.test(contractId.trim()) && Boolean(publicKey);

  return (
    <Page wide>
      <PageHeader title={t("title")} lede={t("lede")} />

      {!connected ? (
        <EmptyState
          icon={Wallet}
          title={t("connectTitle")}
          description={t("connectDescription")}
        />
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="mb-8 max-w-[34rem]"
          >
            <label htmlFor="allowance-token" className="mb-1.5 block text-[0.8125rem] font-medium text-ink">
              {t("tokenLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="allowance-token"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                placeholder="C…"
                spellCheck={false}
                autoComplete="off"
                className="field data text-[0.8125rem]"
              />
              <Button type="submit" variant="secondary" disabled={!canLoad} isLoading={loading}>
                {loaded && !loading && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                {t("load")}
              </Button>
            </div>
          </form>

          {loaded && (
            <Section title={t("listTitle")}>
              <AllowancesPanel
                allowances={allowances}
                loading={loading}
                error={error}
                onRevoke={revoke}
                revokingSpender={revoking}
                onRetry={load}
                emptyTitle={t("emptyTitle")}
                emptyDescription={t("emptyDescription")}
                columns={{
                  spender: t("colSpender"),
                  amount: t("colAmount"),
                  status: t("colStatus"),
                }}
              />
            </Section>
          )}

          <Section title={t("grantTitle")}>
            <AllowanceManager contractId={contractId.trim() || undefined} />
          </Section>
        </>
      )}
    </Page>
  );
}
