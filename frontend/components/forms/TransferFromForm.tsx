"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PreflightCheckDisplay } from "@/components/ui/PreflightCheck";
import { useTransactionSimulator } from "@/hooks/useTransactionSimulator";
import { useWallet } from "@/app/hooks/useWallet";
import {
  buildTransferFromTransaction,
  fetchTokenDecimals,
  parseTokenAmount,
  submitTransaction,
} from "@/lib/stellar";
import { useNetwork } from "@/app/providers/NetworkProvider";
import { AlertCircle, CheckCircle, Send, Loader2 } from "lucide-react";

const transferFromSchema = z.object({
  tokenContractId: z.string().regex(/^C[A-Z0-9]{55}$/, "Invalid token contract ID"),
  fromAddress: z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid source address"),
  toAddress: z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid recipient address"),
  amount: z
    .string()
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Amount must be positive"),
});

type TransferFromFormData = z.infer<typeof transferFromSchema>;

interface TransferFromFormProps {
  onSuccess?: (txHash: string) => void;
  onError?: (error: string) => void;
}

/**
 * Transfer From Form - Transfer tokens using someone's allowance
 */
export function TransferFromForm({ onSuccess, onError }: TransferFromFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preflightResult, setPreflightResult] = useState<{
    isLoading: boolean;
    success: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { connected, publicKey, signTransaction, connect } = useWallet();
  const { networkConfig } = useNetwork();
  const simulator = useTransactionSimulator();

  const {
    register,
    trigger,
    formState: { errors, isValid },
    watch,
    reset,
  } = useForm<TransferFromFormData>({
    resolver: zodResolver(transferFromSchema),
    mode: "onChange",
  });

  const formData = watch();

  const handleCheck = async () => {
    const isValid = await trigger();
    if (!isValid) return;

    setPreflightResult({ isLoading: true, success: false, errors: [], warnings: [] });

    try {
      const decimals = await fetchTokenDecimals(formData.tokenContractId, simulator.networkConfig);
      const rawAmount = parseTokenAmount(formData.amount, decimals);
      const result = await simulator.checkTransferFrom(
        formData.tokenContractId,
        publicKey || "",
        formData.fromAddress,
        formData.toAddress,
        rawAmount,
      );

      setPreflightResult({
        isLoading: false,
        success: result.success,
        errors: result.errors,
        warnings: result.warnings,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPreflightResult({
        isLoading: false,
        success: false,
        errors: [message],
        warnings: [],
      });
    }
  };

  const onSubmit = async () => {
    if (!preflightResult?.success) {
      onError?.("Please run preflight check first");
      return;
    }

    if (!connected || !publicKey) {
      onError?.("Please connect your wallet first");
      await connect();
      return;
    }

    setIsSubmitting(true);
    try {
      const decimals = await fetchTokenDecimals(formData.tokenContractId, simulator.networkConfig);
      const rawAmount = parseTokenAmount(formData.amount, decimals);

      const xdr = await buildTransferFromTransaction({
        tokenContractId: formData.tokenContractId,
        spenderAddress: publicKey,
        fromAddress: formData.fromAddress,
        toAddress: formData.toAddress,
        amount: rawAmount,
        config: networkConfig,
      });

      const signedXdr = await signTransaction(xdr);
      const hash = await submitTransaction(signedXdr, networkConfig);
      setTxHash(hash);
      onSuccess?.(hash);
      reset();
      setPreflightResult(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transfer failed";
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink mb-4">Transfer From Allowance</h2>
        <p className="text-sm text-muted mb-6">
          Transfer tokens on behalf of another address if you have their allowance.
        </p>
      </div>

      <div className="space-y-4">
        <Input
          label="Token Contract ID"
          {...register("tokenContractId")}
          placeholder="C..."
          className="data text-sm"
          error={errors.tokenContractId?.message}
        />

        <Input
          label="Source Address (who gave you allowance)"
          {...register("fromAddress")}
          placeholder="G..."
          className="data text-sm"
          error={errors.fromAddress?.message}
        />

        <Input
          label="Recipient Address"
          {...register("toAddress")}
          placeholder="G..."
          className="data text-sm"
          error={errors.toAddress?.message}
        />

        <Input
          label="Amount"
          {...register("amount")}
          placeholder="0.00"
          type="number"
          step="0.01"
          error={errors.amount?.message}
        />
      </div>

      {preflightResult && (
        <PreflightCheckDisplay
          errors={preflightResult.errors}
          warnings={preflightResult.warnings}
          isLoading={preflightResult.isLoading}
        />
      )}

      {txHash && (
        <div className="flex items-center gap-3 p-4 bg-ok-soft border border-ok/50 rounded-lg">
          <CheckCircle className="h-5 w-5 text-ok flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-ok">Transfer successful!</p>
            <p className="text-xs text-ok">TX: {txHash}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleCheck}
          disabled={!isValid || simulator.isLoading}
          variant="secondary"
          className="flex items-center gap-2"
        >
          {simulator.isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              Run Preflight Check
            </>
          )}
        </Button>

        <Button
          onClick={onSubmit}
          disabled={!preflightResult?.success || isSubmitting}
          className="flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Transferring...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Sign & Transfer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
