import Link from "next/link";
import { LucideIcon, Rocket } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
}

/**
 * The empty state.
 *
 * An empty screen is an invitation, so it says what would fill it and offers
 * the one action that does. No oversized illustration and no ring of tinted
 * colour around the icon — an empty table is not an event.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Rocket,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <Icon className="h-5 w-5 text-faint" aria-hidden />
      <h3 className="mt-3 text-[0.9375rem] font-medium text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[46ch] text-[0.8125rem] leading-relaxed text-muted">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn btn-secondary mt-5">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
