"use client";

import { useEffect, useState, useRef } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Lock, Loader2 } from "lucide-react";
import type { NetworkConfig } from "@/types/network";
import { getContractWasmHash, fetchWasmManifest } from "@/lib/stellar";

type VerificationStatus = "loading" | "verified" | "modified" | "unknown" | "unchecked";

interface ContractVerificationBadgeProps {
  contractId: string;
  networkConfig: NetworkConfig;
  isLocked?: boolean;
  compact?: boolean;
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function ContractVerificationBadge({
  contractId,
  networkConfig,
  isLocked,
  compact,
}: ContractVerificationBadgeProps) {
  const [status, setStatus] = useState<VerificationStatus>("loading");
  const [deployedHash, setDeployedHash] = useState<string | null>(null);
  const [referenceHash, setReferenceHash] = useState<string | null>(null);
  const [referenceVersion, setReferenceVersion] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function verify() {
      setStatus("loading");
      try {
        const [deployed, mfst] = await Promise.all([
          getContractWasmHash(contractId, networkConfig),
          fetchWasmManifest(),
        ]);

        if (cancelled) return;

        if (!deployed) {
          if (mountedRef.current) setStatus("unknown");
          return;
        }

        if (mountedRef.current) setDeployedHash(deployed);

        if (!mfst) {
          if (mountedRef.current) setStatus("unknown");
          return;
        }

        const tokenEntry = mfst.token;
        const latestVersion = tokenEntry?.latest;
        const versionData = latestVersion ? tokenEntry.versions[latestVersion] : null;

        if (!versionData || !versionData.wasm_hash) {
          if (mountedRef.current) setStatus("unknown");
          return;
        }

        if (mountedRef.current) {
          setReferenceHash(versionData.wasm_hash);
          setReferenceVersion(latestVersion);
        }

        if (deployed === versionData.wasm_hash) {
          if (mountedRef.current) setStatus("verified");
        } else {
          if (mountedRef.current) setStatus("modified");
        }
      } catch {
        if (!cancelled && mountedRef.current) setStatus("unknown");
      }
    }

    verify();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [contractId, networkConfig]);

  if (status === "loading") {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verifying...
      </div>
    );
  }

  if (status === "unknown") {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs text-muted">
        <ShieldQuestion className="h-3 w-3" />
        Unverified
      </div>
    );
  }

  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
        <ShieldCheck className="h-3 w-3" />
        {compact ? "Verified" : `Verified (v${referenceVersion})`}
        {isLocked && (
          <Lock className="ml-0.5 h-2.5 w-2.5 text-ok/70" />
        )}
      </span>
    );
  }

  if (status === "modified" && !compact) {
    return (
      <div className="group relative">
        <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
          <ShieldAlert className="h-3 w-3" />
          Modified
        </span>
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-lg border border-danger/30 bg-sunken/95 p-3 text-xs opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <p className="mb-1 font-medium text-danger">Modified Contract</p>
          <p className="mb-1.5 text-muted">
            This contract&apos;s WASM hash does not match the reference build. It
            may have been upgraded or deployed from different source code.
          </p>
          <div className="space-y-0.5 data text-[10px] text-muted">
            {deployedHash && (
              <p>Deployed: {shortenHash(deployedHash)}</p>
            )}
            {referenceHash && (
              <p>Reference: {shortenHash(referenceHash)}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "modified" && compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
        <ShieldAlert className="h-3 w-3" />
        Modified
      </span>
    );
  }

  return null;
}
