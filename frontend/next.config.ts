import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl needs to know where the request config lives. Without this the
// server side of the app has no locale at all, and any prerendered page that
// touches next-intl fails the build with "Couldn't find next-intl config file".
const withNextIntl = createNextIntlPlugin("./lib/i18n.ts");

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default withNextIntl(nextConfig);
