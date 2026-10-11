"use client";
import { CopyButton } from "@/components/ui/CopyButton";
import { ExplorerLink } from "@/components/ui/ExplorerLink";

export function InfoCard({
  label,
  value,
  copyValue,
  isAddress,
}: {
  label: string;
  value: string;
  copyValue?: string;
  isAddress?: boolean;
}) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          {label}
        </span>
        {!isAddress && copyValue && copyValue !== "N/A" && (
          <CopyButton
            label={`Copy ${label}`}
            value={copyValue}
            className="ml-1"
          />
        )}
      </div>
      {isAddress && copyValue && copyValue !== "N/A" ? (
        <ExplorerLink
          type="account"
          identifier={copyValue}
          truncate={true}
          truncateChars={4}
          showCopy={false}
          className="text-lg font-semibold"
        />
      ) : (
        <span className="truncate text-lg font-semibold text-ink">
          {value}
        </span>
      )}
    </div>
  );
}
