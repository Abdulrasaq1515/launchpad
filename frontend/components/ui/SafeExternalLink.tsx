import type { ReactNode } from "react";
import { safeExternalUrl } from "@/lib/safeUrl";

interface SafeExternalLinkProps {
  /** Untrusted URL, e.g. an on-chain `contract_uri` or token metadata link. */
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
  /** Classes for the non-clickable fallback rendered for unsafe URLs. */
  blockedClassName?: string;
}

/**
 * Renders an external link only when `href` is an `https://` or `ipfs://`
 * URL (see `safeExternalUrl`). Anything else — `javascript:`, `data:`,
 * `http:`, garbage — is rendered as plain, non-clickable text so a stored
 * URL can never execute script in this origin.
 */
export function SafeExternalLink({
  href,
  children,
  className = "",
  blockedClassName = "",
}: SafeExternalLinkProps) {
  const safeHref = safeExternalUrl(href);

  if (!safeHref) {
    return (
      <span
        aria-disabled="true"
        title="Link disabled: only https:// and ipfs:// URLs can be opened"
        className={blockedClassName}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
