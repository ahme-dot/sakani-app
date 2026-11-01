import { AgreementRoute } from "@/components/documents-route";

export default function ArabicAgreementPage({ params }: { params: Promise<{ type: string }> }) {
  return <AgreementRoute locale="ar" params={params} />;
}
