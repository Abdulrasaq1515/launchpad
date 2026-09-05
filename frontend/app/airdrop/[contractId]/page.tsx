import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AirdropClaim } from "./AirdropClaim";
import { CONTRACT_ID_RE } from "@/lib/airdrop";

interface PageProps {
  params: Promise<{ contractId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { contractId } = await params;

  return {
    title: `Airdrop — ${contractId.slice(0, 8)}… | SoroPad`,
    description: `Check your allocation and claim from airdrop contract ${contractId}.`,
  };
}

export default async function AirdropClaimPage({ params }: PageProps) {
  const { contractId } = await params;
  const t = await getTranslations("airdrop");

  if (!CONTRACT_ID_RE.test(contractId)) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-2 text-2xl font-semibold text-ink">
          {t("invalidContractId")}
        </h1>
        <p className="text-muted">{t("invalidContractIdMessage")}</p>
        <Link href="/airdrop" className="mt-4 inline-block text-info underline">
          {t("backToBuilder")}
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold text-ink">
        {t("claimTitle")}
      </h1>
      <p className="mb-2 text-muted">{t("claimDescription")}</p>
      <p className="mb-10 break-all data text-xs text-muted">
        {contractId}
      </p>
      <AirdropClaim contractId={contractId} />
    </section>
  );
}
