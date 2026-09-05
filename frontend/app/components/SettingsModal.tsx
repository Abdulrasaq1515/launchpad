"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, X, RotateCcw, CheckCircle, AlertCircle } from "lucide-react";
import { useSettings } from "../hooks/useSettings";

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

// ---------------------------------------------------------------------------
// Settings Modal
// ---------------------------------------------------------------------------

export function SettingsModal() {
  const {
    rpcUrl,
    horizonUrl,
    defaultRpcUrl,
    defaultHorizonUrl,
    setRpcUrl,
    setHorizonUrl,
    resetToDefaults,
  } = useSettings();

  const [open, setOpen] = useState(false);
  const [draftRpc, setDraftRpc] = useState(rpcUrl);
  const [draftHorizon, setDraftHorizon] = useState(horizonUrl);
  const [rpcStatus, setRpcStatus] = useState<ValidationState>("idle");
  const [horizonStatus, setHorizonStatus] = useState<ValidationState>("idle");
  const [rpcError, setRpcError] = useState("");
  const [horizonError, setHorizonError] = useState("");

  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync drafts when context values change (e.g. reset)
  useEffect(() => {
    setDraftRpc(rpcUrl);
    setDraftHorizon(horizonUrl);
  }, [rpcUrl, horizonUrl]);

  // Open / close the native dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  // Close on Escape (native dialog does this, but reset state too)
  const handleClose = useCallback(() => {
    setOpen(false);
    setRpcStatus("idle");
    setHorizonStatus("idle");
    setRpcError("");
    setHorizonError("");
  }, []);

  // ---------------------------------------------------------------------------
  // Validate a URL by sending a lightweight request
  // ---------------------------------------------------------------------------
  const validateUrl = useCallback(
    async (url: string, kind: "rpc" | "horizon"): Promise<boolean> => {
      const setStatus = kind === "rpc" ? setRpcStatus : setHorizonStatus;
      const setError = kind === "rpc" ? setRpcError : setHorizonError;

      if (!isValidUrl(url)) {
        setStatus("invalid");
        setError("Enter a valid HTTP or HTTPS URL.");
        return false;
      }

      setStatus("validating");
      setError("");

      try {
        const endpoint =
          kind === "rpc"
            ? url
            : `${url.replace(/\/$/, "")}/.well-known/stellar.toml`;

        const res = await fetch(endpoint, {
          method: kind === "rpc" ? "POST" : "GET",
          headers: kind === "rpc" ? { "Content-Type": "application/json" } : {},
          body:
            kind === "rpc"
              ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" })
              : undefined,
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok && kind === "rpc") {
          throw new Error(`HTTP ${res.status}`);
        }

        // For Horizon, any non-network-error response is enough
        setStatus("valid");
        return true;
      } catch {
        setStatus("invalid");
        setError("Could not reach this URL. Please check and try again.");
        return false;
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    const [rpcOk, horizonOk] = await Promise.all([
      validateUrl(draftRpc, "rpc"),
      validateUrl(draftHorizon, "horizon"),
    ]);

    if (rpcOk && horizonOk) {
      setRpcUrl(draftRpc);
      setHorizonUrl(draftHorizon);
      handleClose();
    }
  }, [
    draftRpc,
    draftHorizon,
    validateUrl,
    setRpcUrl,
    setHorizonUrl,
    handleClose,
  ]);

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------
  const handleReset = useCallback(() => {
    resetToDefaults();
    setRpcStatus("idle");
    setHorizonStatus("idle");
    setRpcError("");
    setHorizonError("");
  }, [resetToDefaults]);

  // ---------------------------------------------------------------------------
  // Status icon helper
  // ---------------------------------------------------------------------------
  function StatusIcon({ status }: { status: ValidationState }) {
    switch (status) {
      case "validating":
        return (
          <svg
            className="h-4 w-4 animate-spin text-info"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        );
      case "valid":
        return <CheckCircle className="h-4 w-4 text-ok" />;
      case "invalid":
        return <AlertCircle className="h-4 w-4 text-danger" />;
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const isDefault =
    draftRpc === defaultRpcUrl && draftHorizon === defaultHorizonUrl;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-info/30 hover:text-info"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>

      {/* Modal */}
      <dialog
        ref={dialogRef}
        onClose={handleClose}
        aria-labelledby="settings-title"
        className="w-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-lg rounded-2xl border border-line bg-sunken p-0 text-ink backdrop:bg-black/60 backdrop:"
      >
        <div className="flex flex-col gap-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 id="settings-title" className="text-lg font-semibold">Network Settings</h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-muted">
            Configure custom Soroban RPC and Horizon URLs. Changes are saved to
            your browser and persist across sessions.
          </p>

          {/* Soroban RPC URL */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rpc-url" className="ml-1 text-sm font-medium text-body">
              Soroban RPC URL
            </label>
            <div className="relative">
              <input
                id="rpc-url"
                type="url"
                value={draftRpc}
                onChange={(e) => {
                  setDraftRpc(e.target.value);
                  setRpcStatus("idle");
                  setRpcError("");
                }}
                placeholder={defaultRpcUrl}
                aria-describedby={rpcError ? "rpc-error" : undefined}
                aria-invalid={rpcStatus === "invalid"}
                className={`w-full rounded-xl border bg-sunken/50 px-4 py-3 pr-10 text-ink placeholder:text-muted transition-all duration-300 focus:outline-none focus:ring-1 ${
                  rpcStatus === "invalid"
                    ? "border-danger/50 focus:border-danger/50 focus:ring-danger/20"
                    : "border-info/10 focus:border-info/40 focus:ring-info/20"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                <StatusIcon status={rpcStatus} />
              </span>
            </div>
            {rpcError && (
              <span id="rpc-error" className="ml-1 text-xs text-danger" role="alert">{rpcError}</span>
            )}
          </div>

          {/* Horizon URL */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="horizon-url" className="ml-1 text-sm font-medium text-body">
              Horizon URL
            </label>
            <div className="relative">
              <input
                id="horizon-url"
                type="url"
                value={draftHorizon}
                onChange={(e) => {
                  setDraftHorizon(e.target.value);
                  setHorizonStatus("idle");
                  setHorizonError("");
                }}
                placeholder={defaultHorizonUrl}
                aria-describedby={horizonError ? "horizon-error" : undefined}
                aria-invalid={horizonStatus === "invalid"}
                className={`w-full rounded-xl border bg-sunken/50 px-4 py-3 pr-10 text-ink placeholder:text-muted transition-all duration-300 focus:outline-none focus:ring-1 ${
                  horizonStatus === "invalid"
                    ? "border-danger/50 focus:border-danger/50 focus:ring-danger/20"
                    : "border-info/10 focus:border-info/40 focus:ring-info/20"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                <StatusIcon status={horizonStatus} />
              </span>
            </div>
            {horizonError && (
              <span id="horizon-error" className="ml-1 text-xs text-danger" role="alert">{horizonError}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 border-t border-line/5 pt-4">
            <button
              onClick={handleReset}
              disabled={isDefault}
              className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to defaults
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="btn-primary px-4 py-2 text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
