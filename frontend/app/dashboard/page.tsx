"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { useWallet } from "@/app/hooks/useWallet";
import { useNetwork } from "@/app/providers/NetworkProvider";
import { getTrackedDeployments, type TrackedDeployment } from "@/lib/deployments";
import { truncateAddress } from "@/lib/stellar";

/**
 * Token index.
 *
 * Opens with the tokens this browser has launched, because that is what the
 * person almost always came for. The lookup field stays available for the rest
 * of the time — inspecting someone else's contract — rather than being the
 * only thing on an otherwise empty screen.
 */
export default function DashboardIndex() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const { networkConfig } = useNetwork();
  const [contractId, setContractId] = useState("");
  const [error, setError] = useState("");
  const [tracked, setTracked] = useState<TrackedDeployment[]>([]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setTracked([]);
      return;
    }
    setTracked(
      getTrackedDeployments(publicKey).filter(
        (d) => d.network === networkConfig.network,
      ),
    );
  }, [connected, publicKey, networkConfig.network]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = contractId.trim();
    if (!trimmed) {
      setError(t("errors.emptyContract"));
      return;
    }
    if (!/^C[A-Z0-9]{55}$/.test(trimmed) && !/^G[A-Z2-7]{55}$/.test(trimmed)) {
      setError(t("errors.invalidFormat"));
      return;
    }
    setError("");
    router.push(`/dashboard/${trimmed}`);
  };

  return (
    <Page wide>
      <PageHeader title={t("title")} lede={t("description")} />

      <form onSubmit={handleSubmit} className="mb-8 max-w-[34rem]">
        <label htmlFor="contract-lookup" className="sr-only">
          {t("searchLabel")}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <input
              id="contract-lookup"
              type="text"
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value);
                if (error) setError("");
              }}
              placeholder={t("searchPlaceholder")}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "contract-error" : undefined}
              spellCheck={false}
              autoComplete="off"
              className="field data pl-8 text-[0.8125rem]"
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            {t("open")}
          </button>
        </div>
        {error && (
          <p id="contract-error" role="alert" className="mt-1.5 text-[0.8125rem] text-danger">
            {error}
          </p>
        )}
      </form>

      <Section title={t("recent")}>
        {!connected ? (
          <EmptyState
            title={t("connectPrompt")}
            description={t("recentEmpty")}
            actionLabel={t("launchToken")}
            actionHref="/deploy"
          />
        ) : tracked.length === 0 ? (
          <EmptyState
            title={t("recentEmpty")}
            description={t("description")}
            actionLabel={t("launchToken")}
            actionHref="/deploy"
          />
        ) : (
          <div className="panel overflow-hidden">
            <ul className="divide-y divide-line">
              {tracked.map((d) => (
                <li
                  key={d.contractId}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-sunken"
                >
                  <span
                    aria-hidden
                    className="data flex h-7 w-7 flex-none items-center justify-center rounded-[6px] border border-line bg-sunken text-[0.6875rem] font-medium text-body"
                  >
                    {d.symbol.slice(0, 2).toUpperCase()}
                  </span>
                  <Link href={`/dashboard/${d.contractId}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink hover:underline">
                      {d.name}
                    </span>
                    <span className="data block text-[0.75rem] text-muted">
                      {d.symbol} · {truncateAddress(d.contractId)}
                    </span>
                  </Link>
                  <CopyButton value={d.contractId} label={t("sections.contractId")} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </Page>
  );
}
