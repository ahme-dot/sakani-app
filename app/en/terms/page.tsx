import LegalPage from "@/components/legal-page";
import { bilingualMetadata } from "@/lib/metadata";
import { LEGAL_COPY } from "@/messages/legal";

export const metadata = bilingualMetadata("en", "/terms", { title: LEGAL_COPY.en.terms.title, description: LEGAL_COPY.en.terms.intro });

export default function EnglishTermsPage() {
  return <LegalPage locale="en" kind="terms" />;
}
