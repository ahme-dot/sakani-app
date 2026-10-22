import HelpPage from "@/components/help-page";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_COPY } from "@/messages/site";

export const metadata = bilingualMetadata("ar", "/help", { title: `${SITE_COPY.ar.helpTitle} | ${SITE_COPY.ar.brandLabel}`, description: SITE_COPY.ar.helpIntro });

export default function ArabicHelpPage() {
  return <HelpPage locale="ar" />;
}
