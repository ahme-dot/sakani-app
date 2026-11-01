import { AgreementRoute } from "@/components/documents-route";

export default function EnglishAgreementPage({ params }: { params: Promise<{ type: string }> }) {
  return <AgreementRoute locale="en" params={params} />;
}
