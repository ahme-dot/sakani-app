import OwnerAccount from "@/components/owner-account";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default async function ArabicAccountPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <OwnerAccount locale="ar" initialMode={mode === "signup" ? "signup" : "login"} />;
}
