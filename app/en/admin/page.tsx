import AdminDashboard from "@/components/admin-dashboard";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default function EnglishAdminPage() {
  return <AdminDashboard locale="en" />;
}
