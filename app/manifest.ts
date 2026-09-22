import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "CA Progress",
    short_name: "CA Progress",
    description: "Plan, study and track your CA journey from one workspace.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f8",
    theme_color: "#ffffff",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", short_name: "Today", description: "Open today's study plan", url: "/today?source=pwa-shortcut", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Focus", short_name: "Focus", description: "Start a focus session", url: "/study?source=pwa-shortcut", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Progress", short_name: "Progress", description: "Review syllabus progress", url: "/progress?source=pwa-shortcut", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
    ],
  };
}
