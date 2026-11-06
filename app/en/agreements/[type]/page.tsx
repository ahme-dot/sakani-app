import { AgreementRoute } from "@/components/documents-route";
import { agreementMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  return agreementMetadata("en", (await params).type);
}

export default function EnglishAgreementPage({ params }: { params: Promise<{ type: string }> }) {
  return <AgreementRoute locale="en" params={params} />;
}
