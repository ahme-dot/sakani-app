import OwnerAccount from "@/components/owner-account";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default async function EnglishAccountPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <OwnerAccount locale="en" initialMode={mode === "signup" ? "signup" : "login"} />;
}
