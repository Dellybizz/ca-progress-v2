# Phase 20B mobile route and shell inventory

Source of truth: `components/shell/navigation-contract.ts`, `components/ui/icon.tsx`, and `app/styles/tokens.css` on `mobile-phase7-student-parity`. The bundled native app imports these framework-neutral website sources. Website shell behavior is in `components/shell/mobile-app-bar.tsx` and `mobile-navigation.tsx`.

| Website mobile destination | Native shell destination | Current content state |
| --- | --- | --- |
| Home `/dashboard` | `#/dashboard` | Opens saved Today content; dashboard screen parity pending 20C |
| Today `/planner/today` | `#/today` | Saved tasks; content parity pending 20C |
| Focus `/study` | `#/focus` | SQLite timer; content parity pending 20C |
| Progress `/progress` | `#/progress` | Saved syllabus progress; content parity pending 20C |
| Planner `/planner` | `#/planner` | Local queued tasks; content parity pending 20C |
| Syllabus `/syllabus` | `#/syllabus` | Saved catalog; content parity pending 20C |
| Notes `/notes` | `#/notes` | SQLite drafts; content parity pending 20C |
| Resources `/resources` | `#/resources` | Saved resource metadata and files; content parity pending 20D |
| Community `/community` | `#/community` | Saved channels and queued messages; content parity pending 20D |
| Study buddy `/study-buddy` | `#/buddy` | Saved relationships; network actions pending 20D |
| Activity `/activity` | `#/activity` | Saved activity; content parity pending 20D |
| Settings `/settings` | `#/settings` | Device and account actions; content parity pending 20D |
| Profile `/settings/profile` | `#/profile` | Saved profile; accessible through account navigation later |

The website also exposes Calendar, Revision settings, Analytics, Forecast, Goals, Tests, ICAI updates, ICAI resources, Pricing, Billing, and Delete account. As of Phase 20D progress commit `b49ee14a`, those entries show an explicit online handoff that opens the website in the system browser. They require connectivity and may require a separate website sign-in; they do not count as native screen parity. These are 20C/20D route implementation work. Notifications remain a native deep-link destination, outside the website student More groups.

20B shell contract: four website primary items in the same order plus More; shared SVG icons, labels, descriptions and design tokens; mobile app bar with CP mark or Home back action; grouped More sheet; safe area padding and Android system back behavior. Native data remains in the bundled offline SQLite repository.

Verification remaining: compare authenticated website and APK screenshots at the same device width, text scale, theme and account data; exercise More open/close, navigation, focus restoration, Android back, safe areas and an offline cold start on a real phone. Phase 20A's real-device sync certification is still open. No claim of complete screen parity is made here.
