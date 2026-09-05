"use client";

import { DollarSign, Zap, AlertCircle } from "lucide-react";

interface FeeEstimationProps {
  estimatedFee: string | null;
  isLoading: boolean;
  error: string | null;
}

export function FeeEstimation({ estimatedFee, isLoading, error }: FeeEstimationProps) {
  if (isLoading) {
    return (
      <div className="panel p-4 border-info/20">
        <div className="flex items-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-info border-t-transparent rounded-full" />
          <div>
            <p className="text-sm font-medium text-ink">Estimating network fees...</p>
            <p className="text-xs text-muted">Simulating transaction on the network</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel p-4 border-danger/20 bg-danger-soft">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-danger shrink-0" />
          <div>
            <p className="text-sm font-medium text-danger">Fee estimation failed</p>
            <p className="text-xs text-danger">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!estimatedFee) {
    return null;
  }

  return (
    <div className="panel p-4 border-ok/20 bg-ok-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-ok-soft">
            <Zap className="h-5 w-5 text-ok" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Estimated Network Fee</p>
            <p className="text-xs text-muted">Includes base fee and resource costs</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4 text-ok" />
            <span className="text-xl font-bold text-ok">{estimatedFee}</span>
            <span className="text-sm text-muted">XLM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
