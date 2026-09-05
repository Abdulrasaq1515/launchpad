"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

interface HoldToConfirmProps {
  /** Runs once the hold completes. */
  onConfirm: () => void;
  /** Label while idle — say what will happen, in the same words as the toast. */
  children: React.ReactNode;
  /** Label shown while the user is holding. */
  holdingLabel?: string;
  /** How long the hold must last. */
  durationMs?: number;
  disabled?: boolean;
  className?: string;
}

const HOLD_MS = 900;

/**
 * A button that must be held down, not clicked.
 *
 * Reserved for the contract's one-way doors: `revoke_admin` locks a token
 * forever, `renounce_authorization_revocable` cannot be undone, `upgrade`
 * replaces the code every holder is trusting. A confirm dialog for these is
 * theatre — people click through them — so the cost of the action is put into
 * the action itself. Holding is deliberate in a way a second click is not.
 *
 * Keyboard users hold Enter or Space, which behaves identically. Releasing
 * early cancels and the fill retreats, so an accidental press costs nothing.
 * Under reduced-motion the fill still tracks progress, because here it is
 * information about how much longer to hold rather than decoration.
 */
export function HoldToConfirm({
  onConfirm,
  children,
  holdingLabel,
  durationMs = HOLD_MS,
  disabled,
  className = "",
}: HoldToConfirmProps) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const frame = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  const holding = useRef(false);

  const stop = useCallback(() => {
    holding.current = false;
    start.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const begin = useCallback(() => {
    if (disabled || done || holding.current) return;
    holding.current = true;
    start.current = performance.now();

    const tick = (now: number) => {
      if (!holding.current || start.current === null) return;
      const ratio = Math.min(1, (now - start.current) / durationMs);
      setProgress(ratio);
      if (ratio >= 1) {
        holding.current = false;
        setDone(true);
        onConfirm();
        // Leave the confirmed state up briefly so the change is visible
        // before the surrounding UI reacts to it.
        window.setTimeout(() => {
          setDone(false);
          setProgress(0);
        }, 900);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [disabled, done, durationMs, onConfirm]);

  const pct = Math.round(progress * 100);
  const active = progress > 0 && !done;

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") stop();
      }}
      onBlur={stop}
      // Not a plain button: assistive tech should say it needs holding.
      aria-describedby="hold-hint"
      className={`btn btn-danger relative select-none overflow-hidden ${className}`}
    >
      {/* The fill is the progress indicator, not an effect — it is the only
          way to know how much longer the hold needs to last. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-ink/25"
        style={{
          width: `${pct}%`,
          transition: active ? "none" : "width 190ms var(--ease-out)",
        }}
      />
      <span className="relative flex items-center gap-2">
        {done ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Confirmed
          </>
        ) : active ? (
          (holdingLabel ?? "Keep holding…")
        ) : (
          children
        )}
      </span>
      <span id="hold-hint" className="sr-only">
        Press and hold to confirm. This cannot be undone.
      </span>
    </button>
  );
}
