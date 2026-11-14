import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedX — Expiry risk console",
  description: "See which lots will expire unsold, and the discount that clears them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-[14px]">{children}</body>
    </html>
  );
}
