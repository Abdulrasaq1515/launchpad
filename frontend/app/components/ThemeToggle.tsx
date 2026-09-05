"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "soropad:theme";

/**
 * Three-state appearance control.
 *
 * "System" is a real option rather than a default, because an issuer checking
 * a contract at night and an auditor reading the same page in an office want
 * different things, and neither should have to fight the other's preference.
 */
export function ThemeToggle() {
  const t = useTranslations("navigation");
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* private mode — fall back to system */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external-store seed (localStorage), post-hydration only
    setTheme(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* nothing to persist to; the in-page choice still applies */
    }
  }, [theme, mounted]);

  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: t("themeLight"), Icon: Sun },
    { value: "dark", label: t("themeDark"), Icon: Moon },
    { value: "system", label: t("themeSystem"), Icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("theme")}
      className="inline-flex rounded-[7px] border border-line bg-panel p-0.5"
    >
      {options.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`rounded-[5px] p-1.5 transition-colors duration-[120ms] ${
              active ? "bg-sunken text-ink" : "text-faint hover:text-body"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders light, then flips to dark once React mounts —
 * a flash that is worse than either theme on its own. Inlined in <head> so it
 * runs ahead of the first paint rather than after hydration.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
