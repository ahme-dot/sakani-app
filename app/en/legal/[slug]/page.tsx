import LegalPageRoute from "@/components/legal-page-route";

export default function EnglishLegalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <LegalPageRoute locale="en" params={params} />;
}
