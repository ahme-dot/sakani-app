import FlyerPage from "@/components/flyer-page";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default function EnglishFlyerPage() {
  return <FlyerPage locale="en" />;
}
