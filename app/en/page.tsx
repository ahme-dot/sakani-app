import HomeRoute from "@/components/home-route";
import { bilingualMetadata } from "@/lib/metadata";

export const metadata = bilingualMetadata("en", "");

export default function EnglishPage() {
  return <HomeRoute locale="en" />;
}
