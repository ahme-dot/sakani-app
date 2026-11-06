import LegalPageRoute from "@/components/legal-page-route";
import { legalPageMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return legalPageMetadata("ar", (await params).slug);
}

export default function ArabicLegalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <LegalPageRoute locale="ar" params={params} />;
}
