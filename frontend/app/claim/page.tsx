"use client";

import { useTranslations } from "next-intl";
import { ClaimVesting } from "./ClaimVesting";
import { Page, PageHeader } from "@/components/ui/Page";

export default function ClaimPage() {
  const t = useTranslations("claim");
  return (
    <Page>
      <PageHeader title={t("title")} lede={t("description")} />
      <ClaimVesting />
    </Page>
  );
}
