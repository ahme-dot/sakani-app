import LegalPageRoute from "@/components/legal-page-route";
import { legalPageMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return legalPageMetadata("en", (await params).slug);
}

export default function EnglishLegalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <LegalPageRoute locale="en" params={params} />;
}
