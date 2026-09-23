import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRuntime } from "@/components/pwa/pwa-runtime";
import { APP_RELEASE_CONTRACT } from "@/config/app-release";
import { NativeRuntime } from "@/components/mobile/native-runtime";

const appearanceBootScript = `(()=>{try{const k='ca-progress:appearance';const d={theme:'system',accent:'indigo',density:'comfortable',reduceMotion:false};const p={...d,...JSON.parse(localStorage.getItem(k)||'{}')};const dark=p.theme==='dark'||(p.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);const r=document.documentElement;r.dataset.theme=dark?'dark':'light';r.dataset.themePreference=p.theme;r.dataset.accent=['indigo','violet','emerald','rose'].includes(p.accent)?p.accent:'indigo';r.dataset.density=p.density==='compact'?'compact':'comfortable';r.dataset.reduceMotion=p.reduceMotion?'true':'false'}catch{}})()`;

export const metadata: Metadata = {
  title: { default: "CA Progress V2", template: "%s · CA Progress V2" },
  description: "CA Progress V2 staging - private Study Buddy accountability, shared goals and Study Together.",
  applicationName: "CA Progress",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "CA Progress" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191c25" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-accent="indigo" data-density="comfortable" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: appearanceBootScript }}/></head><body>{children}<NativeRuntime/><PwaRuntime releaseVersion={APP_RELEASE_CONTRACT.web.version}/></body></html>;
}
