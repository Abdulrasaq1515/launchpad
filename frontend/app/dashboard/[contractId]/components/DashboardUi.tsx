"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle, FileQuestion } from "lucide-react";
import { truncateAddress } from "@/lib/stellar";

export function LoadingState() {
  const t = useTranslations("dashboard");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-info" />
      <p className="text-sm text-muted">{t("fetching")}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="h-10 w-10 text-danger" />
      <p className="max-w-md text-muted">{message}</p>
      <button onClick={onRetry} className="btn-secondary px-4 py-2 text-sm">
        {t("retry")}
      </button>
    </div>
  );
}

export function NotATokenState({ contractId }: { contractId: string }) {
  const t = useTranslations("dashboard");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <FileQuestion className="h-12 w-12 text-warn" />
      <h2 className="text-xl font-bold text-ink">{t("notATokenTitle")}</h2>
      <p className="max-w-md text-muted">
        {t("notATokenDesc", { contractId: truncateAddress(contractId) })}
      </p>
      <p className="text-sm text-muted">
        {t("notATokenNote")}
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center rounded-lg border border-line bg-sunken px-5 py-2.5 text-sm font-medium text-body transition-colors hover:border-info/30 hover:bg-info-soft hover:text-info"
      >
        {t("backToSearchLink")}
      </Link>
    </div>
  );
}
