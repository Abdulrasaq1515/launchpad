"use client";

import { Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

/**
 * Copy control.
 *
 * The confirmation is the icon swapping in place, scaled up from nothing —
 * no tooltip, no layout shift, nothing to dismiss. Copying is a low-stakes
 * action people repeat, so the feedback should be over as fast as it lands.
 * The change is also announced, because a purely visual tick tells a screen
 * reader user nothing.
 */
export const CopyButton = ({
  value,
  label = "Copy to clipboard",
  className = "",
}: CopyButtonProps) => {
  const [copied, copy] = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={`inline-flex items-center justify-center rounded-[5px] p-1 text-faint transition-colors duration-[120ms] hover:bg-sunken hover:text-ink ${className}`}
      aria-label={label}
      title={label}
    >
      <span className="relative block h-3.5 w-3.5">
        <Copy
          className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-[190ms] ${
            copied ? "scale-50 opacity-0" : "scale-100 opacity-100"
          }`}
          style={{ transitionTimingFunction: "var(--ease-out)" }}
          aria-hidden
        />
        <Check
          className={`absolute inset-0 h-3.5 w-3.5 text-ok transition-all duration-[190ms] ${
            copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
          aria-hidden
        />
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
};
