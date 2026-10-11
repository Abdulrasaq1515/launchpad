"use client";

import { useTranslations } from "next-intl";
import { useNetwork } from "../providers/NetworkProvider";
import { AlertTriangle } from "lucide-react";

export function MainnetWarning() {
  const t = useTranslations("mainnetWarning");
  const { networkConfig, mounted } = useNetwork();

  if (!mounted || networkConfig.network !== "mainnet") {
    return null;
  }

  return (
    <div className="bg-warn-soft border-b border-warn/20 py-2 px-4 flex items-center justify-center gap-2 text-warn text-xs font-medium sticky top-16 z-40">
      <AlertTriangle className="size-3.5" />
      <span>
        {t("message", { network: networkConfig.network })}
      </span>
    </div>
  );
}
