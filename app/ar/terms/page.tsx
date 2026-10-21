import LegalPage from "@/components/legal-page";
import { bilingualMetadata } from "@/lib/metadata";
import { LEGAL_COPY } from "@/messages/legal";

export const metadata = bilingualMetadata("ar", "/terms", { title: LEGAL_COPY.ar.terms.title, description: LEGAL_COPY.ar.terms.intro });

export default function ArabicTermsPage() {
  return <LegalPage locale="ar" kind="terms" />;
}
