"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Rocket,
  LayoutGrid,
  CalendarClock,
  Send,
  KeyRound,
  Wallet,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SettingsModal } from "./SettingsModal";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Routes that should also light this item up. */
  match?: (path: string) => boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The primary navigation rail.
 *
 * Grouped by what the issuer is doing — creating supply, distributing it,
 * or managing their own account — rather than by which contract is involved.
 * A launchpad's user does not think in contracts.
 *
 * The active item is marked by a single signal-coloured rail that slides
 * between positions. It is the one piece of motion in the chrome, and it
 * exists to answer a navigation the user just made: where they landed, and
 * where they came from. Its position is measured rather than animated per
 * item, so there is exactly one moving element on screen.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState<{ top: number; height: number } | null>(null);

  const groups: NavGroup[] = [
    {
      label: t("sections.issue"),
      items: [
        { href: "/deploy", label: t("deploy"), icon: Rocket },
        {
          href: "/dashboard",
          label: t("dashboard"),
          icon: LayoutGrid,
          match: (p) => p.startsWith("/dashboard") && !p.startsWith("/dashboard/allowances"),
        },
      ],
    },
    {
      label: t("sections.distribute"),
      items: [
        { href: "/claim", label: t("vesting"), icon: CalendarClock },
        { href: "/airdrop", label: t("airdrop"), icon: Send },
        {
          href: "/allowances",
          label: t("allowances"),
          icon: KeyRound,
          match: (p) => p.startsWith("/allowances") || p.startsWith("/dashboard/allowances"),
        },
      ],
    },
    {
      label: t("sections.account"),
      items: [{ href: "/my-account", label: t("myAccount"), icon: Wallet }],
    },
  ];

  const isActive = (item: NavItem) =>
    item.match ? item.match(pathname) : pathname === item.href;

  // Measure the active link and park the rail on it. Reading layout after
  // paint is the point here — the rail has to track real positions, which
  // change with locale (label length) and viewport.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>("[data-active='true']");
      if (!active) {
        setRail(null);
        return;
      }
      setRail({ top: active.offsetTop, height: active.offsetHeight });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-4 pt-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-ink transition-colors hover:bg-sunken"
        >
          <SoroPadMark />
          <span className="text-[0.95rem] font-semibold tracking-tight">SoroPad</span>
        </Link>
      </div>

      <div ref={listRef} className="relative flex-1 overflow-y-auto px-3 pb-4">
        {/* The single moving element. Hidden until measured so it never
            animates in from the top on first paint. */}
        <span
          aria-hidden
          className="absolute left-3 w-[3px] rounded-full bg-signal"
          style={{
            top: rail?.top ?? 0,
            height: rail?.height ?? 0,
            opacity: rail ? 1 : 0,
            transition:
              "top var(--t-base) var(--ease-spring), height var(--t-base) var(--ease-out), opacity var(--t-fast) linear",
          }}
        />

        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-3 pb-1.5 text-[0.7rem] font-medium text-faint">
              {group.label}
            </p>
            <nav className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    data-active={active}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 rounded-[7px] px-3 py-[0.4375rem] text-sm transition-colors duration-[120ms] ${
                      active
                        ? "bg-sunken font-medium text-ink"
                        : "text-body hover:bg-sunken hover:text-ink"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 flex-none transition-colors duration-[120ms] ${
                        active ? "text-ink" : "text-faint group-hover:text-body"
                      }`}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Preferences. These belong to the person, not to the work, so they sit
          at the foot of the rail rather than in the top bar — which is
          reserved for state that can change while you are looking at it. */}
      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle />
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <SettingsModal />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The mark: a ledger column with one filled cell.
 *
 * A token launch is one entry written into a sequence that cannot be edited
 * afterwards, which is the whole product in one glyph — and it avoids the
 * rocket emoji the brand was using, which said "startup" rather than
 * "issuance".
 */
function SoroPadMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="15" height="15" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="5" width="8" height="2.5" rx="0.75" fill="var(--signal)" />
      <rect x="5" y="9" width="8" height="1.25" rx="0.625" fill="currentColor" opacity="0.35" />
      <rect x="5" y="12" width="5" height="1.25" rx="0.625" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export { SoroPadMark };
