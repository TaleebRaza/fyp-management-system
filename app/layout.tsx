import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { AuthProvider } from "./Providers";

export const metadata: Metadata = {
  title: "FYP Management System",
  description: "University Final Year Project Portal",
  icons: {
    icon: '/logo.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {/* 2. We wrap the entire application so every page has access to the login state */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
