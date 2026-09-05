"use client";

import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer
      role="contentinfo"
      className="border-t border-line/5 py-8 text-center text-sm text-muted"
    >
      <p>
        {t("builtFor")}{" "}
        <a
          href="https://www.drips.network/wave"
          className="text-info hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("stellarWave")}
        </a>{" "}
        · {t("license")}
      </p>
    </footer>
  );
}
