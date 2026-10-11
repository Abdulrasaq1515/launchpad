"use client";

import React, { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PreflightCheckDisplay } from "@/components/ui/PreflightCheck";
import type { UseAdminActionResult } from "../../hooks/useAdminAction";
import { AdminCard, ModeToggle } from "./AdminCard";
import { ActionSuccess } from "./ConfirmPanel";
import { HoldToConfirm } from "@/components/ui/HoldToConfirm";
import { burnSchema, type BurnData } from "./schemas";

/**
 * The two admin-initiated removals share one form because they take the same
 * inputs and differ only in where the tokens end up:
 *   "clawback" → confiscate into the admin balance (reversible)
 *   "burn"     → destroy, reducing total supply (irreversible)
 */
export function SupplyCard({
  admin,
  disabled,
}: {
  admin: UseAdminActionResult;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"clawback" | "burn">("clawback");
  // Held button submits the form it sits in, so validation still runs.
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<BurnData>({ resolver: zodResolver(burnSchema) });

  const action = mode === "burn" ? "burn-admin" : "clawback";
  const preflight = admin.preflight[action];
  const inFlight =
    admin.loading === "clawback" || admin.loading === "burn-admin";
  const succeeded =
    admin.success === "clawback" || admin.success === "burn-admin";

  const onSubmit = async (data: BurnData) => {
    if (await admin.run(action, data)) {
      form.reset();
      admin.clearPreflight(action);
    }
  };

  return (
    <AdminCard
      title="Remove Assets"
      icon={Flame}
      accent="red"
      headerAction={
        <ModeToggle
          label="Removal mode"
          value={mode}
          activeClassName="bg-danger"
          onChange={(next) => {
            setMode(next);
            admin.clearPreflight(
              next === "burn" ? "clawback" : "burn-admin",
            );
          }}
          options={[
            { value: "clawback", label: "Confiscate" },
            { value: "burn", label: "Destroy" },
          ]}
        />
      }
    >
      {/* Differentiate the two admin-initiated removals for the operator. */}
      <p className="text-xs text-muted mb-4 leading-relaxed">
        {mode === "clawback" ? (
          <>
            <span className="font-semibold text-danger">
              Confiscate to admin (clawback):
            </span>{" "}
            forcibly moves tokens into the admin balance. Reversible — you can
            transfer them back later.
          </>
        ) : (
          <>
            <span className="font-semibold text-danger">
              Permanently destroy (burn admin):
            </span>{" "}
            burns tokens out of existence, reducing total supply. This cannot be
            undone.
          </>
        )}
      </p>

      <form
        ref={formRef}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4 flex-grow"
      >
        <Input
          label="Source Address"
          placeholder="G..."
          className="bg-sunken border-line"
          {...form.register("from")}
          error={form.formState.errors.from?.message}
        />
        <Input
          label="Amount"
          type="number"
          placeholder="0.00"
          className="bg-sunken border-line"
          {...form.register("amount")}
          error={form.formState.errors.amount?.message}
        />
        {preflight && (
          <PreflightCheckDisplay
            isLoading={admin.isSimulating}
            errors={preflight.errors}
            warnings={preflight.warnings}
            successMessage={
              !preflight.errors?.length && !preflight.warnings?.length
                ? mode === "burn"
                  ? "Burn transaction is ready"
                  : "Clawback transaction is ready"
                : undefined
            }
          />
        )}
        {/* Burning destroys someone else's tokens with no way to restore
            them, so it has to be held rather than clicked. Clawback moves the
            same tokens into the admin balance and can be sent back, so a
            single click is the right weight for it. */}
        {mode === "burn" && !succeeded ? (
          <HoldToConfirm
            className="mt-4 w-full"
            disabled={disabled || inFlight}
            onConfirm={() => formRef.current?.requestSubmit()}
          >
            Burn from this account
          </HoldToConfirm>
        ) : (
          <Button
            type="submit"
            variant="secondary"
            className="mt-4 w-full border-danger/25 text-danger hover:border-danger/40"
            isLoading={inFlight}
            disabled={disabled}
          >
            {succeeded ? <ActionSuccess /> : "Move to admin balance"}
          </Button>
        )}
      </form>
    </AdminCard>
  );
}
