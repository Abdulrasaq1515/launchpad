"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tabs - Simple tab component
 */
export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={className}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              _value: value,
              _onValueChange: onValueChange,
            })
          : child,
      )}
    </div>
  );
}

/**
 * TabsList - Container for tab triggers
 */
export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-sunken p-1 text-muted w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * TabsTrigger - Individual tab button
 */
export function TabsTrigger({
  value,
  children,
  className,
  ...props
}: TabsTriggerProps & { _value?: string; _onValueChange?: (v: string) => void }) {
  const isActive = props._value === value;

  return (
    <button
      onClick={() => props._onValueChange?.(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-info text-ink shadow-sm"
          : "text-muted hover:text-ink hover:bg-sunken",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * TabsContent - Content for a tab
 */
export function TabsContent({
  value,
  children,
  className,
  ...props
}: TabsContentProps & { _value?: string }) {
  if (props._value !== value) return null;

  return <div className={cn("mt-2 ring-offset-background", className)}>{children}</div>;
}
