import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type Tone = "info" | "ok" | "warn" | "danger";

const ICONS = {
  info: Info,
  ok: CheckCircle2,
  warn: AlertTriangle,
  danger: XCircle,
} as const;

const TONES = {
  info: "border-info/25 bg-info-soft text-info",
  ok: "border-ok/25 bg-ok-soft text-ok",
  warn: "border-warn/25 bg-warn-soft text-warn",
  danger: "border-danger/25 bg-danger-soft text-danger",
} as const;

/**
 * An inline message about the state of the thing you are looking at.
 *
 * Tinted fill plus a matching border, no icon circle and no shadow — it should
 * read as part of the page it interrupts, not as a card floating above it.
 * Errors say what happened and what to do, so `children` carries the recovery.
 */
export function Alert({
  tone,
  variant,
  title,
  children,
  className = "",
}: {
  tone?: Tone;
  /** Legacy tone names, still used by the banners and the airdrop builder. */
  variant?: "default" | "destructive" | "warning" | "success";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const resolved: Tone =
    tone ??
    (variant === "destructive"
      ? "danger"
      : variant === "warning"
        ? "warn"
        : variant === "success"
          ? "ok"
          : "info");
  const Icon = ICONS[resolved];
  return (
    <div
      role={resolved === "danger" ? "alert" : "status"}
      className={`flex gap-2.5 rounded-[7px] border p-3 text-[0.8125rem] ${TONES[resolved]} ${className}`}
    >
      <Icon className="mt-px h-3.5 w-3.5 flex-none" aria-hidden />
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : "opacity-90"}>{children}</div>}
      </div>
    </div>
  );
}


/** Heading inside an Alert. */
export function AlertTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`font-medium ${className}`}>{children}</p>;
}

/** Body copy inside an Alert — what happened, and what to do about it. */
export function AlertDescription({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`opacity-90 ${className}`}>{children}</div>;
}
