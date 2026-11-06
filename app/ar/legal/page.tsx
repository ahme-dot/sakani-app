import LegalHubRoute from "@/components/legal-hub-route";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_COPY } from "@/messages/site";

export const metadata = bilingualMetadata("ar", "/legal", { title: SITE_COPY.ar.legalHubTitle, description: SITE_COPY.ar.legalHubIntro });

export default function ArabicLegalHubPage() {
  return <LegalHubRoute locale="ar" />;
}
