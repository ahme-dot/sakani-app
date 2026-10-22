import HostPage from "@/components/host-page";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_COPY } from "@/messages/site";

export const metadata = bilingualMetadata("ar", "/host", { title: `${SITE_COPY.ar.hostHeroTitle} | ${SITE_COPY.ar.brandLabel}`, description: SITE_COPY.ar.hostHeroText });

export default function ArabicHostPage() {
  return <HostPage locale="ar" />;
}
