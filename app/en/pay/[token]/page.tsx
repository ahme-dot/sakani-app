import PayRoute from "@/components/pay-route";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default async function EnglishPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayRoute locale="en" token={token} />;
}
