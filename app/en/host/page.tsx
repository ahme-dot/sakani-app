import HostPage from "@/components/host-page";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_COPY } from "@/messages/site";

export const metadata = bilingualMetadata("en", "/host", { title: `${SITE_COPY.en.hostHeroTitle} | ${SITE_COPY.en.brandLabel}`, description: SITE_COPY.en.hostHeroText });

export default function EnglishHostPage() {
  return <HostPage locale="en" />;
}
