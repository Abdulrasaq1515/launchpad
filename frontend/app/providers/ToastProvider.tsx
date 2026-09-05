"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  duration: number;
}

export interface ToastInput {
  title: string;
  message?: string;
  variant?: ToastVariant;
  duration?: number;
  txHash?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION_MS = 5_000;
const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const toast: Toast = {
        id,
        title: input.title,
        message: input.message,
        variant: input.variant ?? "info",
        duration: input.duration ?? DEFAULT_DURATION_MS,
      };

      setToasts((prev) => {
        const next = [...prev, toast];
        return next.length > MAX_TOASTS
          ? next.slice(next.length - MAX_TOASTS)
          : next;
      });

      // Emit notification event for NotificationCenter
      if (typeof window !== "undefined") {
        const event = new CustomEvent("soropad:notification", {
          detail: {
            id,
            title: input.title,
            message: input.message || "",
            variant: input.variant || "info",
            timestamp: Date.now(),
            read: false,
          },
        });
        window.dispatchEvent(event);
      }

      if (toast.duration > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // Bridge: allow non-React modules (lib/soroban.ts) to push toasts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    interface ToastBridge {
      show: (t: ToastInput) => string;
      dismiss: (id: string) => void;
    }
    const w = window as unknown as { __soropadToast?: ToastBridge };
    w.__soropadToast = { show, dismiss };
    return () => {
      if (w.__soropadToast) {
        delete w.__soropadToast;
      }
    };
  }, [show, dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, show, dismiss, clear }),
    [toasts, show, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

/* ── Viewport ───────────────────────────────────────────────── */

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const variantStyles: Record<
  ToastVariant,
  {
    border: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
  }
> = {
  info: {
    border: "border-info/30",
    icon: Info,
    iconColor: "text-info",
  },
  success: {
    border: "border-ok/30",
    icon: CheckCircle2,
    iconColor: "text-ok",
  },
  warning: {
    border: "border-warn/30",
    icon: AlertTriangle,
    iconColor: "text-warn",
  },
  error: {
    border: "border-danger/30",
    icon: XCircle,
    iconColor: "text-danger",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const styles = variantStyles[toast.variant];
  const Icon = styles.icon;

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${styles.border} bg-sunken/95 p-4 animate-in slide-in-from-right-4 duration-200`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${styles.iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.message && (
          <p className="mt-1 text-xs leading-relaxed text-body break-words">
            {toast.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-md p-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
