import LegalPage from "@/components/legal-page";
import { bilingualMetadata } from "@/lib/metadata";
import { LEGAL_COPY } from "@/messages/legal";

export const metadata = bilingualMetadata("en", "/privacy", { title: LEGAL_COPY.en.privacy.title, description: LEGAL_COPY.en.privacy.intro });

export default function EnglishPrivacyPage() {
  return <LegalPage locale="en" kind="privacy" />;
}
