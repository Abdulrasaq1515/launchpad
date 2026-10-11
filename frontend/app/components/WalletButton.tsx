"use client";

import { useTranslations } from "next-intl";
import { useWallet } from "../hooks/useWallet";
import { CopyButton } from "@/components/ui/CopyButton";

/**
 * Truncate a Stellar public key for display: `GABC…WXYZ`.
 */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Navbar wallet button.
 *
 * - **Disconnected:** shows a "Connect Wallet" CTA.
 * - **Connected:** shows the truncated public key with a disconnect option.
 */
export function WalletButton() {
  const t = useTranslations("wallet");
  const { connected, publicKey, loading, connect, disconnect } = useWallet();

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        {/* Truncated address badge */}
        <span
          className="flex items-center gap-1.5 rounded-[7px] border border-line bg-panel px-2.5 py-1.5 data text-xs text-body"
          title={publicKey}
        >
          {truncateAddress(publicKey)}
          <CopyButton value={publicKey} label={t("copyAddress")} />
        </span>

        {/* Disconnect button */}
        <button
          onClick={disconnect}
          className="rounded-[7px] px-2 py-1.5 text-xs text-muted transition-colors duration-[120ms] hover:bg-sunken hover:text-danger"
        >
          {t("disconnect")}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={loading}
      className="btn btn-primary"
    >
      {loading ? t("connectingEllipsis") : t("connect")}
    </button>
  );
}
