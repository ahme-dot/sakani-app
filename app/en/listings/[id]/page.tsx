import ListingRoute, { generateListingMetadata } from "@/components/listing-route";

type Props = { params: Promise<{ id: string }> };

export function generateMetadata(props: Props) {
  return generateListingMetadata("en", props);
}

export default function EnglishListingPage({ params }: Props) {
  return <ListingRoute locale="en" params={params} />;
}
