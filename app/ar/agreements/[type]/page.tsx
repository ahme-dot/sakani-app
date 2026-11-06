import { AgreementRoute } from "@/components/documents-route";
import { agreementMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  return agreementMetadata("ar", (await params).type);
}

export default function ArabicAgreementPage({ params }: { params: Promise<{ type: string }> }) {
  return <AgreementRoute locale="ar" params={params} />;
}
