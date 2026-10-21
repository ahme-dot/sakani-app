import LegalPage from "@/components/legal-page";
import { bilingualMetadata } from "@/lib/metadata";
import { LEGAL_COPY } from "@/messages/legal";

export const metadata = bilingualMetadata("ar", "/privacy", { title: LEGAL_COPY.ar.privacy.title, description: LEGAL_COPY.ar.privacy.intro });

export default function ArabicPrivacyPage() {
  return <LegalPage locale="ar" kind="privacy" />;
}
