"use client";

import { useTranslations } from "next-intl";
import DeployForm from "./DeployForm";
import { Page, PageHeader } from "@/components/ui/Page";

export default function DeployPage() {
  const t = useTranslations("deploy");
  return (
    <Page>
      <PageHeader title={t("title")} lede={t("description")} />
      <DeployForm />
    </Page>
  );
}
