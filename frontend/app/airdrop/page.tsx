import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AirdropBuilder } from "./AirdropBuilder";
import { Page, PageHeader } from "@/components/ui/Page";

export const metadata: Metadata = {
  title: "Airdrops — SoroPad",
  description:
    "Build a Merkle airdrop from a CSV of addresses and amounts, publish the root on chain, and export proofs for recipients.",
};

export default async function AirdropBuilderPage() {
  const t = await getTranslations("airdrop");
  return (
    <Page wide>
      <PageHeader title={t("builderTitle")} lede={t("builderDescription")} />
      <AirdropBuilder />
    </Page>
  );
}
