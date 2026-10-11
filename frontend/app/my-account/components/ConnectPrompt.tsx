"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";

export function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  const t = useTranslations("myAccount");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="rounded-2xl border border-line bg-sunken p-6">
        <Wallet className="h-12 w-12 text-info" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-ink">{t("connectTitle")}</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          {t("connectDescription")}
        </p>
      </div>
      <button onClick={onConnect} className="btn-primary px-8 py-3 text-sm">
        {t("connectWallet")}
      </button>
    </div>
  );
}
