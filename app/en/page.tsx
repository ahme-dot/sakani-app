import HomeRoute, { type HomeSearchParams } from "@/components/home-route";
import { bilingualMetadata } from "@/lib/metadata";

export const metadata = bilingualMetadata("en", "");

export default function EnglishPage({ searchParams }: { searchParams: HomeSearchParams }) {
  return <HomeRoute locale="en" searchParams={searchParams} />;
}
