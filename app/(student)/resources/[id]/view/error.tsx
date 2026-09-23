"use client";
export default function ResourceViewerError({ reset }: { reset: () => void }) {
  return <div className="phase8-viewer-page"><div className="mobile-resource-viewer__fallback"><h2>Resource preview is unavailable</h2><p>The file was not changed. Reconnect and retry, or return to the resource library.</p><button className="ui-button ui-button--primary" onClick={reset}>Try again</button></div></div>;
}
