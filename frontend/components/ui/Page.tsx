import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Page frame.
 *
 * Every screen gets the same measure and the same gutter, so moving between
 * them does not shift the content under the reader. Width is capped for
 * reading and released for tables, which need the room.
 */
export function Page({
  children,
  wide = false,
  className = "",
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${wide ? "max-w-[84rem]" : "max-w-[60rem]"} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Page heading.
 *
 * The title says where you are; `lede` says what this screen is for, in one
 * sentence, in the second person. No eyebrow label above it — the navigation
 * rail already says which section you are in, and repeating it in tracked-out
 * capitals is chrome pretending to be information.
 */
export function PageHeader({
  title,
  lede,
  actions,
  back,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 text-[0.8125rem] text-muted transition-colors duration-[120ms] hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
            <path
              d="M10 3.5 5.5 8l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] font-semibold leading-tight sm:text-2xl">
            {title}
          </h1>
          {lede && (
            <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled region within a page. */
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            {title && <h2 className="text-[0.9375rem] font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 max-w-[56ch] text-[0.8125rem] text-muted">
                {description}
              </p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
