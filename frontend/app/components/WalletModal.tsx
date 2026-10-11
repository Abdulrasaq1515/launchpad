"use client";

import { useEffect, useState } from "react";
import type { WalletAdapter } from "../lib/wallets";
import { walletAdapters } from "../lib/wallets";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWallet: (adapter: WalletAdapter) => void;
}

export function WalletModal({
  isOpen,
  onClose,
  onSelectWallet,
}: WalletModalProps) {
  const [availableWallets, setAvailableWallets] = useState<
    Array<{ adapter: WalletAdapter; available: boolean }>
  >([]);

  useEffect(() => {
    async function checkWallets() {
      const wallets = await Promise.all(
        walletAdapters.map(async (adapter) => ({
          adapter,
          available: await adapter.isAvailable(),
        }))
      );
      setAvailableWallets(wallets);
    }

    if (isOpen) {
      checkWallets();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-panel dark:bg-gray-800 rounded-lg max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-ink">
            Connect Wallet
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-gray-700 dark:text-muted dark:hover:text-ink"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {availableWallets.map(({ adapter, available }) => (
            <button
              key={adapter.id}
              onClick={() => {
                onSelectWallet(adapter);
                onClose();
              }}
              disabled={!available}
              className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                available
                  ? "border-gray-200 hover:border-info hover:bg-blue-50 dark:border-line dark:hover:border-info dark:hover:bg-blue-900/20 cursor-pointer"
                  : "border-gray-100 bg-gray-50 dark:border-line dark:bg-gray-900 cursor-not-allowed opacity-50"
              }`}
            >
              {/* A two-letter mark rather than an emoji: these identify third-party
                  wallets, and a rocket or a lobster says nothing about which
                  one you are about to hand a signing request to. */}
              <span
                aria-hidden
                className="data flex h-9 w-9 flex-none items-center justify-center rounded-[7px] border border-line bg-sunken text-[0.75rem] font-medium text-body"
              >
                {adapter.icon}
              </span>
              <div className="flex-1 text-left">
                <div className="font-semibold text-gray-900 dark:text-ink">
                  {adapter.name}
                </div>
                {!available && (
                  <div className="text-sm text-muted dark:text-muted">
                    Not installed
                  </div>
                )}
              </div>
              {available && (
                <svg
                  className="w-5 h-5 text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm text-muted dark:text-muted text-center">
          By connecting a wallet, you agree to the Terms of Service
        </p>
      </div>
    </div>
  );
}
