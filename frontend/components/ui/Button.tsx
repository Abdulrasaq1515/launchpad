import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  isLoading?: boolean;
  size?: "sm" | "md";
}

/**
 * The base control.
 *
 * A button reports its own state rather than being replaced by a spinner:
 * the label stays put and the icon slot fills, so the control does not
 * change width mid-action and the user keeps reading the same words.
 */
export const Button = ({
  children,
  variant = "primary",
  size = "md",
  isLoading,
  className = "",
  disabled,
  ...props
}: ButtonProps) => (
  <button
    className={`btn btn-${variant} ${size === "sm" ? "px-2.5 py-1 text-[0.8125rem]" : ""} ${className}`}
    disabled={disabled || isLoading}
    aria-busy={isLoading || undefined}
    {...props}
  >
    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
    {children}
  </button>
);
