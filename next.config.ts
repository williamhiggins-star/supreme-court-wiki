import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      // Bare domain lands on the entry carousel.
      { source: "/", destination: "/welcome", permanent: false },
      // Legacy JSON-backed case pages -> the same case's deep link into
      // the new dashboard. Real risk of external backlinks/indexing here
      // (this route has been live), unlike /scotusdashboard2* below.
      { source: "/cases/:slug", destination: "/dashboard?case=:slug", permanent: false },
      // Legacy docket columns have no section-deep-link equivalent yet --
      // land in the app itself rather than 404 or the splash screen.
      { source: "/docket/:column", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
