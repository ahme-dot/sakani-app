import AdminSignIn from "@/components/admin-sign-in";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default function EnglishAdminSignInPage() {
  return <AdminSignIn locale="en" />;
}
