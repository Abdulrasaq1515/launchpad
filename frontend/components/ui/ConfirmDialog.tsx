"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  variant?: "danger" | "warning" | "info";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
  variant = "danger",
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, loading, onCancel]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    firstElement?.focus();

    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: "text-danger",
      button: "bg-danger hover:bg-red-700 focus:ring-danger",
    },
    warning: {
      icon: "text-warn",
      button: "bg-warn hover:bg-yellow-700 focus:ring-warn",
    },
    info: {
      icon: "text-info",
      button: "bg-info hover:bg-blue-700 focus:ring-info",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-xl border border-line bg-sunken p-6 animate-scale-in"
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon */}
        <div className="mb-4 flex items-center gap-3">
          <div className={`rounded-full bg-sunken p-2 ${styles.icon}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 id="dialog-title" className="text-xl font-semibold text-ink">
            {title}
          </h2>
        </div>

        {/* Message */}
        <p
          id="dialog-description"
          className="mb-6 text-sm leading-relaxed text-body"
        >
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-line bg-sunken px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-void-900 disabled:opacity-40 ${styles.button}`}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
