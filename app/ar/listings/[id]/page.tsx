import ListingRoute, { generateListingMetadata } from "@/components/listing-route";

type Props = { params: Promise<{ id: string }> };

export function generateMetadata(props: Props) {
  return generateListingMetadata("ar", props);
}

export default function ArabicListingPage({ params }: Props) {
  return <ListingRoute locale="ar" params={params} />;
}
