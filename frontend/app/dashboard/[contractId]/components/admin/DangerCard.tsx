"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { UseAdminActionResult } from "../../hooks/useAdminAction";
import { AdminCard } from "./AdminCard";
import { ActionSuccess } from "./ConfirmPanel";
import { upgradeSchema, type UpgradeData } from "./schemas";

/**
 * Replace the contract WASM in place. Gated behind typing the token symbol,
 * because it changes the logic under every existing holder.
 */
export function DangerCard({
  admin,
  disabled,
  locked,
  tokenSymbol,
}: {
  admin: UseAdminActionResult;
  disabled: boolean;
  locked: boolean;
  tokenSymbol?: string;
}) {
  const form = useForm<UpgradeData>({ resolver: zodResolver(upgradeSchema) });
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = form.handleSubmit(async (data) => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    const expectedSymbol = (tokenSymbol ?? "").toUpperCase();
    if (data.confirmSymbol.trim().toUpperCase() !== expectedSymbol) {
      form.setError("confirmSymbol", {
        message: `Type "${expectedSymbol}" exactly to confirm.`,
      });
      return;
    }

    if (await admin.run("upgrade", data)) {
      form.reset();
      setShowConfirm(false);
    }
  });

  return (
    <div className="mt-2 w-full">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="flex-1 border-t border-line/5" />
        <span className="text-[0.75rem] font-medium text-faint">
          Advanced / Danger
        </span>
        <div className="flex-1 border-t border-line/5" />
      </div>

      <AdminCard
        title="Upgrade Contract"
        icon={Upload}
        accent="yellow"
        className="border border-warn/25 bg-warn-soft"
        description="Replace the contract WASM with a new version. Affects all holders immediately."
      >
        {locked ? (
          <div className="flex items-center gap-2 rounded-lg border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Contract is locked — upgrades are permanently disabled.
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-xl border border-warn/25 bg-warn-soft p-3 text-xs leading-relaxed text-warn">
              <strong className="text-warn">Before upgrading:</strong>{" "}
              ensure the new WASM has been reviewed and audited. This replaces
              contract logic for every token holder and cannot be undone unless
              the new contract itself supports a further upgrade.
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="upgrade-wasm-hash"
                  className="mb-1.5 block text-xs font-medium text-body"
                >
                  New WASM Hash{" "}
                  <span className="text-muted">(64 hex characters)</span>
                </label>
                <input
                  id="upgrade-wasm-hash"
                  {...form.register("wasmHash")}
                  placeholder="a1b2c3d4e5f6… (64 hex chars)"
                  disabled={disabled}
                  className="w-full rounded-xl border border-line bg-sunken px-3 py-2 data text-xs text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-warn disabled:opacity-40"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={64}
                />
                {form.formState.errors.wasmHash && (
                  <p className="mt-1 text-xs text-danger">
                    {form.formState.errors.wasmHash.message}
                  </p>
                )}
              </div>

              {showConfirm && (
                <div className=" space-y-2 rounded-xl border border-warn/25 bg-warn-soft p-4">
                  <p className="text-[0.75rem] font-medium text-warn text-center">
                    Confirm upgrade
                  </p>
                  <p className="text-xs text-center text-body leading-relaxed">
                    Type the token symbol{" "}
                    <span className="data font-bold text-warn">
                      {tokenSymbol ?? "SYMBOL"}
                    </span>{" "}
                    to confirm you understand this is irreversible.
                  </p>
                  <input
                    {...form.register("confirmSymbol")}
                    aria-label="Token symbol confirmation"
                    placeholder={tokenSymbol ?? "SYMBOL"}
                    disabled={admin.loading === "upgrade"}
                    className="w-full rounded-xl border border-line bg-sunken px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-warn disabled:opacity-40"
                    autoComplete="off"
                  />
                  {form.formState.errors.confirmSymbol && (
                    <p className="text-xs text-danger">
                      {form.formState.errors.confirmSymbol.message}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {showConfirm && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirm(false);
                      form.clearErrors("confirmSymbol");
                    }}
                    className="flex-1 rounded-xl border border-line bg-sunken px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-40"
                    disabled={admin.loading === "upgrade"}
                  >
                    Cancel
                  </button>
                )}
                <Button
                  type="submit"
                  className={`${showConfirm ? "flex-1" : "w-full"} bg-warn-soft hover:bg-warn-soft border-none shadow-purple-600/20`}
                  isLoading={admin.loading === "upgrade"}
                  disabled={disabled}
                >
                  {admin.success === "upgrade" ? (
                    <ActionSuccess label="Upgraded" />
                  ) : showConfirm ? (
                    "Confirm Upgrade"
                  ) : (
                    <span className="flex items-center gap-2">
                      <Upload className="w-4 h-4" aria-hidden="true" /> Upgrade
                      Contract
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </AdminCard>
    </div>
  );
}
