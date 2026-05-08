import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit'],
  
  compress: true, // ✅ Added
  
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'], // ✅ Added
  },
};

export default withSentryConfig(nextConfig, {
  org: "sen-cl",
  project: "fyp-proposal",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});