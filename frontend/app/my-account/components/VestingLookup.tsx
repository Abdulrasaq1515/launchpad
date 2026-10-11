"use client";

import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";

export function VestingLookup({
  vestingContractId,
  onChange,
  onLookup,
  loading,
  error,
}: {
  vestingContractId: string;
  onChange: (value: string) => void;
  onLookup: () => void;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations("myAccount");

  return (
    <div className="panel p-5">
      <p className="mb-3 text-xs text-muted">
        {t("vestingLookupDescription")}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={vestingContractId}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("vestingPlaceholder")}
          className="flex-1 rounded-lg border border-line bg-sunken px-4 py-2 text-sm text-ink placeholder-faint outline-none transition-colors focus:border-info/50 focus:ring-1 focus:ring-info/30"
        />
        <button
          onClick={onLookup}
          disabled={loading || !vestingContractId.trim()}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {t("vestingSchedules")}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
