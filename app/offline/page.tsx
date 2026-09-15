import { OfflineWorkspace } from "@/components/offline/offline-workspace";
// Public, data-free shell. All private content is loaded from owner-scoped IndexedDB.
export const dynamic = "force-static";
export default function OfflinePage() { return <OfflineWorkspace/>; }
