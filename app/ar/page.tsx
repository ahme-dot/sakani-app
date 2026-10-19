import HomeRoute from "@/components/home-route";
import { bilingualMetadata } from "@/lib/metadata";

export const metadata = bilingualMetadata("ar", "");

export default function ArabicPage() {
  return <HomeRoute locale="ar" />;
}
