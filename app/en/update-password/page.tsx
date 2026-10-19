import AdminPasswordReset from "@/components/admin-password-reset";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default function EnglishAdminPasswordResetPage() {
  return <AdminPasswordReset locale="en" />;
}
