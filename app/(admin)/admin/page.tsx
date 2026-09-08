import { ProductPreviewPage } from "@/components/mock/product-preview";
import { requireAdminPageCapability } from "@/lib/authorization/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPageCapability("admin.dashboard.read");
  return <ProductPreviewPage variant="admin" />;
}
