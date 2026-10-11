"use client";

import { ExternalLink } from "lucide-react";
import { truncateAddress, getStellarExpertUrl } from "@/lib/stellar";
import { CopyButton } from "./CopyButton";
import { useNetwork } from "@/app/providers/NetworkProvider";

interface ExplorerLinkProps {
  type: "account" | "contract" | "tx";
  identifier: string;
  truncate?: boolean;
  truncateChars?: number;
  showCopy?: boolean;
  className?: string;
  label?: string;
  displayText?: string;
}

/**
 * ExplorerLink component displays blockchain identifiers (addresses, contract IDs, tx hashes)
 * with a clickable link to Stellar Expert and optional copy functionality.
 */
export function ExplorerLink({
  type,
  identifier,
  truncate = true,
  truncateChars = 4,
  showCopy = true,
  className = "",
  label,
  displayText,
}: ExplorerLinkProps) {
  const { networkConfig } = useNetwork();

  if (!identifier || identifier === "N/A" || identifier === "-") {
    return <span className={className}>{identifier || "-"}</span>;
  }

  const text =
    displayText ||
    (truncate ? truncateAddress(identifier, truncateChars) : identifier);

  const explorerUrl = getStellarExpertUrl(
    type,
    identifier,
    networkConfig.network,
  );

  const linkLabel = label || `View ${type} on Stellar Expert`;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 data text-info transition-colors hover:text-info hover:underline"
        title={linkLabel}
        aria-label={linkLabel}
      >
        <span>{text}</span>
        <ExternalLink className="h-3 w-3" />
      </a>
      {showCopy && <CopyButton value={identifier} label={`Copy ${type}`} />}
    </div>
  );
}
