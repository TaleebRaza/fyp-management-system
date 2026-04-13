import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./Providers"; // 1. We import our new intercom system!

export const metadata: Metadata = {
  title: "FYP Management System",
  description: "University Final Year Project Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* 2. We wrap the entire application so every page has access to the login state */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}