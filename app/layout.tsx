import type { Metadata } from "next";
import type { CSSProperties } from 'react';
import { connection } from "next/server";
import "./globals.css";
import { AuthProvider } from "./Providers";
import { getBranding } from '../lib/branding';
import { getPortalMetadataTitle } from '../types/branding';

type BrandingStyle = CSSProperties & Record<`--${string}`, string>;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const branding = await getBranding();
  return {
    title: getPortalMetadataTitle(branding),
    description: `${branding.universityName} Final Year Project Portal`,
    icons: { icon: branding.logoUrl },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const branding = await getBranding();
  const brandingStyle: BrandingStyle = {
    '--branding-primary': branding.primaryColor,
    '--branding-accent': branding.accentColor,
    '--color-on-primary': branding.primaryTextColor,
    '--color-on-accent': branding.accentTextColor,
  };

  return (
    <html
      lang="en"
      data-branding-logo-url={branding.logoUrl}
      data-branding-university-name={branding.universityName}
      style={brandingStyle}
    >
      <body suppressHydrationWarning>
        {/* 2. We wrap the entire application so every page has access to the login state */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
