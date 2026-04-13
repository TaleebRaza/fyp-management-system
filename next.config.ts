import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only use the modern Next.js 15+ syntax:
  serverExternalPackages: ['pdfkit'],
};

export default nextConfig;