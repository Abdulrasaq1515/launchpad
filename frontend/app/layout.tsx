import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./providers/WalletProvider";
import { SettingsProvider } from "./providers/SettingsProvider";
import { NetworkProvider } from "./providers/NetworkProvider";
import { AccessibilityProvider } from "./providers/AccessibilityProvider";
import { LocaleProvider } from "./providers/LocaleProvider";
import { I18nProvider } from "./providers/I18nProvider";
import { ToastProvider } from "./providers/ToastProvider";
import { AppShell } from "./components/AppShell";
import { ThemeScript } from "./components/ThemeToggle";

// Archivo: a grotesque with slightly narrow, upright letterforms — it keeps
// long contract names and dense tables legible at small sizes without the
// neutral-startup feel of the usual UI sans.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
});

// Plex Mono for machine data only: addresses, hashes, token amounts. Its
// slashed zero and distinct 1/l matter when someone is checking a contract ID
// character by character before signing.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  ),
  title: "SoroPad — Soroban Token Launchpad",
  description:
    "Deploy and manage SEP-41 compliant tokens on Stellar Soroban. No code required.",
  openGraph: {
    title: "SoroPad — Soroban Token Launchpad",
    description:
      "Deploy and manage SEP-41 compliant tokens on Stellar Soroban. No code required.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <ThemeScript />
      </head>
      <body className={`${archivo.variable} ${plexMono.variable} min-h-screen`}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <LocaleProvider>
          <ToastProvider>
            <I18nProvider>
              <NetworkProvider>
                <SettingsProvider>
                  <WalletProvider>
                    <AccessibilityProvider>
                      <AppShell>{children}</AppShell>
                    </AccessibilityProvider>
                  </WalletProvider>
                </SettingsProvider>
              </NetworkProvider>
            </I18nProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
