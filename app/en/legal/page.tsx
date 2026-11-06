import LegalHubRoute from "@/components/legal-hub-route";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_COPY } from "@/messages/site";

export const metadata = bilingualMetadata("en", "/legal", { title: SITE_COPY.en.legalHubTitle, description: SITE_COPY.en.legalHubIntro });

export default function EnglishLegalHubPage() {
  return <LegalHubRoute locale="en" />;
}
