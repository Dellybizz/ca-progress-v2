"use client";
import { useState } from "react";
export function CopyFailureButton({ detail }: { detail: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="ui-button ui-button--sm" onClick={async()=>{await navigator.clipboard.writeText(detail);setCopied(true);}}>{copied ? "Copied" : "Copy failure details"}</button>;
}
