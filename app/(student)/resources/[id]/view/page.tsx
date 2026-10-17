import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { ResourceViewer } from "@/components/resources/resource-viewer";
import { getResourceDetailModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resource viewer | CA Progress" };

export default async function ResourceViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await getResourceDetailModel(id);
  if (model.mode === "guest") return <div className="phase7-page"><LoginRequired next={`/resources/${id}/view`} title="Sign in to open this resource"/></div>;
  if (model.mode === "missing") notFound();
  return <div className="phase8-viewer-page"><ResourceViewer id={id} title={model.resource.title} filename={model.resource.originalFilename} mimeType={model.resource.mimeType}/></div>;
}
