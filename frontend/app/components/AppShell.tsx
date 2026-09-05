"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { WalletButton } from "./WalletButton";
import { NotificationCenter } from "./NotificationCenter";
import { MainnetWarning } from "./MainnetWarning";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * The application frame: a persistent navigation rail, a thin top bar for
 * state that is true everywhere (network, wallet, alerts), and the page.
 *
 * The rail replaced a top navbar because this is a tool people keep open
 * while they work, not a site they pass through — the destinations should
 * stay on screen rather than collapse behind a row of links. The top bar
 * holds only things whose value can change under you.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A navigation should not leave the drawer covering the page it opened.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // While the drawer is over the content, the content behind it should not
  // scroll — otherwise closing it returns you somewhere you never went.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Persistent rail — desktop */}
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-panel lg:block">
        <Sidebar />
      </aside>

      {/* Drawer — small screens */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={t("closeMenu")}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 w-[15rem] border-r border-line bg-panel">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-[6px]">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("openMenu")}
              aria-expanded={drawerOpen}
              className="btn btn-ghost -ml-1.5 px-2 lg:hidden"
            >
              {drawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {/* Three controls, and only these three: the network an action
                will hit, anything that has happened since you looked, and who
                you are signing as. Appearance, language and RPC settings are
                preferences — they live in the rail's footer, because they do
                not change under you while you work. */}
            <div className="ml-auto flex items-center gap-2">
              <NetworkSwitcher />
              <NotificationCenter />
              <WalletButton />
            </div>
          </div>
          <MainnetWarning />
        </header>

        <main id="main-content" role="main" className="min-w-0 flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
