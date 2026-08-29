import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CA Progress V2", template: "%s · CA Progress V2" },
  description: "CA Progress V2 staging - Phase 1 design system and new UX language.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-accent="indigo" data-density="comfortable"><body>{children}</body></html>;
}
