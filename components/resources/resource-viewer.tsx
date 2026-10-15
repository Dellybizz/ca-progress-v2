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
  const [previewResult,setTextPreview]=useState<{resourceId:string;state:string;text:string;message?:string;downloadOnly?:boolean}|null>(null);
  const textPreview=previewResult?.resourceId===id?previewResult:null;
  useEffect(()=>{if(!offlineUrl){const controller=new AbortController();fetch(`/api/resources/${encodeURIComponent(id)}/preview?text=1`,{signal:controller.signal}).then(response=>response.ok?response.json():{state:'unavailable',text:'',downloadOnly:true}).then(payload=>{if(!controller.signal.aborted)setTextPreview({...payload,resourceId:id});}).catch(()=>{if(!controller.signal.aborted)setTextPreview({resourceId:id,state:'unavailable',text:'',downloadOnly:true});});return()=>controller.abort();}},[id,mimeType,offlineUrl]);
  const [offlineChecked, setOfflineChecked] = useState(false);
  const onlineUrl = `/api/resources/${encodeURIComponent(id)}/access`;
  const source = offlineUrl || onlineUrl;
  const downloadOnly=textPreview?.downloadOnly===true;
  const previewChecked=Boolean(offlineUrl||textPreview);
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
    {!previewChecked && kind!=="other" ? <p role="status">Checking preview availability…</p> : null}
    {!downloadOnly && previewChecked && kind === "image" ? <div className="mobile-resource-viewer__image"><Image src={source} alt={title} fill unoptimized sizes="100vw"/></div> : null}
    {!downloadOnly && previewChecked && kind === "pdf" ? <iframe className="mobile-resource-viewer__frame" src={source} title={title}/> : null}
    {kind === "other" && textPreview?.text ? <article className="fm-document-preview"><p style={{whiteSpace:'pre-wrap'}}>{textPreview.text}</p></article> : null}
    {(downloadOnly || kind === "other" && !textPreview?.text) ? <div className="mobile-resource-viewer__fallback"><h2>Preview is not available for this file</h2><p>{textPreview?.message || "Download the file to open it in a compatible app. Access remains protected by the same short-lived authorization."}</p><a className="ui-button ui-button--primary" href={`${onlineUrl}?download=1`} target="_blank" rel="noreferrer">Download {filename}</a></div> : null}
  </section>;
}
