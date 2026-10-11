"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useNetwork } from "../providers/NetworkProvider";
import { useTranslations } from "next-intl";

/**
 * Network selector.
 *
 * Which network you are on decides whether an action costs real money, so it
 * stays visible at all times rather than living behind a settings panel, and
 * mainnet is marked in signal yellow — the same colour every irreversible
 * control uses.
 */
export function NetworkSwitcher() {
  const t = useTranslations("navigation");
  const { networkConfig, setNetwork, mounted } = useNetwork();
  const [open, setOpen] = useState(false);

  if (!mounted) {
    return <div className="h-7 w-[5.5rem] rounded-[7px] border border-line bg-sunken" />;
  }

  const isMainnet = networkConfig.network === "mainnet";
  const networks = [
    { id: "testnet" as const, label: "Testnet" },
    { id: "mainnet" as const, label: "Mainnet" },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("network")}
        className="flex items-center gap-1.5 rounded-[7px] border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-body transition-colors duration-[120ms] hover:bg-sunken hover:text-ink"
      >
        <span
          className={`dot ${isMainnet ? "text-signal" : "dot-live"}`}
          aria-hidden
        />
        <span className="capitalize">{networkConfig.network}</span>
        <ChevronDown
          className={`h-3 w-3 text-faint transition-transform duration-[190ms] ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-1.5 w-36 overflow-hidden rounded-[7px] border border-line bg-panel p-1"
          >
            {networks.map(({ id, label }) => {
              const active = networkConfig.network === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setNetwork(id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-[5px] px-2 py-1.5 text-left text-xs transition-colors duration-[120ms] ${
                      active ? "bg-sunken text-ink" : "text-body hover:bg-sunken hover:text-ink"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`dot ${id === "mainnet" ? "text-signal" : "text-ok"}`}
                        aria-hidden
                      />
                      {label}
                    </span>
                    {active && <Check className="h-3 w-3" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
