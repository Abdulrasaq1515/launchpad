import type { ReactNode } from "react";
import { AnimatedNumber } from "./AnimatedNumber";

/**
 * A single figure with its label.
 *
 * Label above value, both left-aligned on the same axis, because these are
 * read in rows and a shared left edge is what makes a row scannable. The
 * value is the only thing allowed to be large.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  animate = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  /** Roll the digits when this figure changes. Only for values that move. */
  animate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.75rem] text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-[1.0625rem] font-medium text-ink">
        {animate ? (
          <AnimatedNumber value={value} />
        ) : (
          <span className="data truncate">{value}</span>
        )}
        {unit && <span className="text-[0.8125rem] text-muted">{unit}</span>}
      </p>
      {hint && <div className="mt-1 text-[0.75rem] text-muted">{hint}</div>}
    </div>
  );
}

/**
 * A row of figures separated by rules rather than boxed into cards.
 *
 * Cards would imply each number is independent; these are facets of one token,
 * so they share a surface and are divided by a hairline.
 */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
      {children}
    </div>
  );
}

export function StatCell({ children }: { children: ReactNode }) {
  return <div className="border-b border-line p-4 last:border-b-0 sm:border-b-0">{children}</div>;
}
