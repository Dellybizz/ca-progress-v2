"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { getOfflineFile } from "@/lib/offline/database";

type Props = { id: string; title: string; filename: string; mimeType: string };

export function ResourceViewer({ id, title, filename, mimeType }: Props) {
  const context = useStudentContext();
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null);
  const [offlineChecked, setOfflineChecked] = useState(false);
  const onlineUrl = `/api/v1/resources/${encodeURIComponent(id)}/access`;
  const source = offlineUrl || onlineUrl;
  const kind = useMemo(() => mimeType === "application/pdf" ? "pdf" : mimeType.startsWith("image/") ? "image" : "other", [mimeType]);

  useEffect(() => {
    let url = "";
    let cancelled = false;
    void (async () => {
      if (context.userId) {
        const saved = await getOfflineFile(context.userId, id);
        if (saved?.file && !cancelled) { url = URL.createObjectURL(saved.file); setOfflineUrl(url); }
      }
      if (!cancelled) setOfflineChecked(true);
    })().catch(() => { if (!cancelled) setOfflineChecked(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [context.userId, id]);

  return <section className="mobile-resource-viewer" aria-label={`Viewing ${title}`}>
    <div className="mobile-resource-viewer__bar">
      <div><strong>{filename}</strong><span>{offlineUrl ? "Saved copy on this device" : offlineChecked ? "Secure online preview" : "Checking saved files…"}</span></div>
      <div><Link href={`/resources/${id}`}>Details</Link><a href={`${onlineUrl}?download=1`} target="_blank" rel="noreferrer">Download</a></div>
    </div>
    {kind === "image" ? <div className="mobile-resource-viewer__image"><Image src={source} alt={title} fill unoptimized sizes="100vw"/></div> : null}
    {kind === "pdf" ? <iframe className="mobile-resource-viewer__frame" src={source} title={title}/> : null}
    {kind === "other" ? <div className="mobile-resource-viewer__fallback"><h2>Preview is not available for this file type</h2><p>Download the file to open it in a compatible app. Access remains protected by the same short-lived authorization.</p><a className="ui-button ui-button--primary" href={`${onlineUrl}?download=1`} target="_blank" rel="noreferrer">Download {filename}</a></div> : null}
  </section>;
}
