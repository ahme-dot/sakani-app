import HelpPage from "@/components/help-page";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_COPY } from "@/messages/site";

export const metadata = bilingualMetadata("en", "/help", { title: `${SITE_COPY.en.helpTitle} | ${SITE_COPY.en.brandLabel}`, description: SITE_COPY.en.helpIntro });

export default function EnglishHelpPage() {
  return <HelpPage locale="en" />;
}
