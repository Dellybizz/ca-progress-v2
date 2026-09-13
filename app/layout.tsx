import type { Metadata } from "next";
import "./globals.css";

const appearanceBootScript = `(()=>{try{const k='ca-progress:appearance';const d={theme:'system',accent:'indigo',density:'comfortable',reduceMotion:false};const p={...d,...JSON.parse(localStorage.getItem(k)||'{}')};const dark=p.theme==='dark'||(p.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);const r=document.documentElement;r.dataset.theme=dark?'dark':'light';r.dataset.themePreference=p.theme;r.dataset.accent=['indigo','violet','emerald','rose'].includes(p.accent)?p.accent:'indigo';r.dataset.density=p.density==='compact'?'compact':'comfortable';r.dataset.reduceMotion=p.reduceMotion?'true':'false'}catch{}})()`;

export const metadata: Metadata = {
  title: { default: "CA Progress V2", template: "%s · CA Progress V2" },
  description: "CA Progress V2 staging - private Study Buddy accountability, shared goals and Study Together.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-accent="indigo" data-density="comfortable" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: appearanceBootScript }}/></head><body>{children}</body></html>;
}
