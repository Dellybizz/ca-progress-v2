import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CA Progress V2 Staging",
  description: "Isolated CA Progress V2 staging foundation.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
