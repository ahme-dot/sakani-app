import HomeRoute, { type HomeSearchParams } from "@/components/home-route";
import { bilingualMetadata } from "@/lib/metadata";

export const metadata = bilingualMetadata("ar", "");

export default function ArabicPage({ searchParams }: { searchParams: HomeSearchParams }) {
  return <HomeRoute locale="ar" searchParams={searchParams} />;
}
