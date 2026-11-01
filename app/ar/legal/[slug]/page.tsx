import LegalPageRoute from "@/components/legal-page-route";

export default function ArabicLegalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <LegalPageRoute locale="ar" params={params} />;
}
