"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  FileCode2,
  Fingerprint,
  Gauge,
  KeyRound,
  Lock,
  Search,
  Send,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { RecentLaunches } from "./components/RecentLaunches";
import { CONTRACT_ID_REGEX } from "@/lib/contractValidation";
import { useNetwork } from "./providers/NetworkProvider";
import { Page } from "@/components/ui/Page";

export default function Home() {
  const t = useTranslations("home");
  const router = useRouter();
  const { networkConfig } = useNetwork();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLookup = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const val = query.trim();
      if (!val) {
        setError(t("lookupEmptyError"));
        return;
      }
      if (!CONTRACT_ID_REGEX.test(val)) {
        setError(t("lookupInvalidError"));
        return;
      }
      setError(null);
      // The public token route is network-scoped; sending a bare contract ID
      // here used to 404 every lookup made from this page.
      router.push(`/token/${networkConfig.network}/${val}`);
    },
    [query, router, t, networkConfig.network],
  );

  const capabilities = [
    { key: "vesting", Icon: CalendarClock },
    { key: "airdrop", Icon: Send },
    { key: "allowances", Icon: KeyRound },
    { key: "supply", Icon: Gauge },
    { key: "compliance", Icon: ShieldCheck },
    { key: "controls", Icon: UserCog },
  ] as const;

  const permanent = ["revokeAdmin", "renounce", "upgrade", "cap"] as const;

  const trust = [
    { key: "source", Icon: FileCode2 },
    { key: "hashes", Icon: Fingerprint },
    { key: "testnet", Icon: CheckCircle2 },
  ] as const;

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <Page wide className="pt-10 sm:pt-16">
        <div className="max-w-[46rem] rise">
          <h1 className="text-[2rem] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[2.75rem]">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[54ch] text-[1.0625rem] leading-relaxed text-body">
            {t("description")}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Link href="/deploy" className="btn btn-primary px-4 py-2.5">
              {t("deployButton")}
            </Link>
            <a
              href="https://github.com/soropad/launchpad"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary px-4 py-2.5"
            >
              {t("githubButton")}
            </a>
          </div>

          <form onSubmit={handleLookup} className="mt-9 max-w-[34rem]">
            <label
              htmlFor="token-lookup"
              className="mb-1.5 block text-[0.8125rem] font-medium text-ink"
            >
              {t("lookupLabel")}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                  aria-hidden
                />
                <input
                  id="token-lookup"
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={t("lookupPlaceholder")}
                  aria-label={t("lookupAriaLabel")}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "lookup-error" : undefined}
                  spellCheck={false}
                  autoComplete="off"
                  className="field data pl-8 text-[0.8125rem]"
                />
              </div>
              <button type="submit" className="btn btn-secondary">
                {t("lookupSubmit")}
              </button>
            </div>
            {error && (
              <p
                id="lookup-error"
                role="alert"
                className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] text-danger"
              >
                <AlertCircle className="mt-px h-3.5 w-3.5 flex-none" aria-hidden />
                {error}
              </p>
            )}
          </form>
        </div>
      </Page>

      {/* ── Live launches: the proof this thing runs ────────────────── */}
      <RecentLaunches />

      {/* ── What the contract can enforce ──────────────────────────── */}
      <Page wide>
        <h2 className="text-lg font-semibold">{t("capabilities.title")}</h2>
        <p className="mt-1 max-w-[58ch] text-sm text-muted">
          {t("capabilities.description")}
        </p>

        <div className="mt-5 grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(({ key, Icon }) => (
            <div key={key} className="bg-panel p-5">
              <Icon className="h-4 w-4 text-muted" aria-hidden />
              <h3 className="mt-3 text-[0.9375rem] font-medium">
                {t(`capabilities.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
                {t(`capabilities.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </Page>

      {/* ── One-way doors. The part nobody else shows you. ─────────── */}
      <Page wide>
        <div className="panel panel-marked overflow-hidden">
          <div className="border-b border-line p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Lock className="h-4 w-4 text-signal-ink" aria-hidden />
              {t("permanent.title")}
            </h2>
            <p className="mt-1 max-w-[60ch] text-sm text-muted">
              {t("permanent.description")}
            </p>
          </div>
          <ul className="divide-y divide-line">
            {permanent.map((key) => (
              <li key={key} className="flex gap-4 p-5 sm:p-6">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-signal"
                />
                <div>
                  <h3 className="text-[0.9375rem] font-medium">
                    {t(`permanent.${key}.title`)}
                  </h3>
                  <p className="mt-1 max-w-[66ch] text-[0.8125rem] leading-relaxed text-muted">
                    {t(`permanent.${key}.description`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Page>

      {/* ── Verify rather than trust ────────────────────────────────── */}
      <Page wide className="pb-16">
        <h2 className="text-lg font-semibold">{t("trust.title")}</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          {trust.map(({ key, Icon }) => (
            <div key={key}>
              <Icon className="h-4 w-4 text-muted" aria-hidden />
              <h3 className="mt-2.5 text-[0.9375rem] font-medium">
                {t(`trust.${key}.title`)}
              </h3>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                {t(`trust.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </Page>
    </>
  );
}
